/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',

  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;

      if (!text) {
        return await sock.sendMessage(chatId, {
          text: 'Usage: .song <song name or YouTube link>'
        }, { quoted: msg });
      }

      let video;

      // Detect YouTube URL or search query
      if (
        text.includes('youtube.com') ||
        text.includes('youtu.be')
      ) {
        video = {
          url: text,
          title: 'YouTube Audio',
          thumbnail: 'https://i.imgur.com/8fK4h6F.jpeg',
          timestamp: 'Unknown'
        };
      } else {
        const search = await yts(text);

        if (!search || !search.videos.length) {
          return await sock.sendMessage(chatId, {
            text: '❌ No results found.'
          }, { quoted: msg });
        }

        video = search.videos[0];
      }

      // Inform user
      await sock.sendMessage(chatId, {
        image: { url: video.thumbnail },
        caption:
`🎵 Downloading: *${video.title}*
⏱ Duration: ${video.timestamp}`
      }, { quoted: msg });

      let audioData;
      let audioBuffer;
      let downloadSuccess = false;

      // API fallback chain
      const apiMethods = [
        {
          name: 'EliteProTech',
          method: () => APIs.getEliteProTechDownloadByUrl(video.url)
        },
        {
          name: 'Yupra',
          method: () => APIs.getYupraDownloadByUrl(video.url)
        },
        {
          name: 'Okatsu',
          method: () => APIs.getOkatsuDownloadByUrl(video.url)
        },
        {
          name: 'Izumi',
          method: () => APIs.getIzumiDownloadByUrl(video.url)
        }
      ];

      for (const apiMethod of apiMethods) {
        try {

          console.log(`Trying API: ${apiMethod.name}`);

          audioData = await apiMethod.method();

          const audioUrl =
            audioData.download ||
            audioData.dl ||
            audioData.url;

          if (!audioUrl) {
            console.log(`${apiMethod.name} returned no URL`);
            continue;
          }

          console.log('Download URL:', audioUrl);

          try {

            // ARRAYBUFFER DOWNLOAD
            const audioResponse = await axios({
              method: 'GET',
              url: audioUrl,
              responseType: 'arraybuffer',
              timeout: 90000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              decompress: true,
              maxRedirects: 10,
              validateStatus: status =>
                status >= 200 && status < 500,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
              }
            });

            console.log('HTTP Status:', audioResponse.status);

            // Reject non-success statuses
            if (
              audioResponse.status >= 300 &&
              audioResponse.status < 400
            ) {
              console.log('Redirect detected');
              continue;
            }

            if (audioResponse.status >= 400) {
              console.log('Bad response status');
              continue;
            }

            // Content-Type validation
            const contentType =
              audioResponse.headers['content-type'] || '';

            console.log('Content-Type:', contentType);

            if (contentType.includes('text/html')) {
              console.log('HTML page received instead of audio');
              continue;
            }

            audioBuffer = Buffer.from(audioResponse.data);

            // Validate buffer
            if (
              audioBuffer &&
              audioBuffer.length > 10000
            ) {
              downloadSuccess = true;
              console.log(`Success from ${apiMethod.name}`);
              break;
            }

          } catch (downloadErr) {

            console.log(
              `${apiMethod.name} arraybuffer failed:`,
              downloadErr.message
            );

            console.log(
              'Status:',
              downloadErr.response?.status
            );

            console.log(
              'Headers:',
              downloadErr.response?.headers
            );

            console.log(
              'Redirect:',
              downloadErr.response?.headers?.location
            );

            // STREAM MODE FALLBACK
            try {

              const audioResponse = await axios({
                method: 'GET',
                url: audioUrl,
                responseType: 'stream',
                timeout: 90000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                maxRedirects: 10,
                validateStatus: status =>
                  status >= 200 && status < 500,
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': '*/*',
                  'Accept-Encoding': 'identity'
                }
              });

              console.log(
                'Stream HTTP Status:',
                audioResponse.status
              );

              if (
                audioResponse.status >= 300 &&
                audioResponse.status < 400
              ) {
                continue;
              }

              const contentType =
                audioResponse.headers['content-type'] || '';

              if (contentType.includes('text/html')) {
                continue;
              }

              const chunks = [];

              await new Promise((resolve, reject) => {
                audioResponse.data.on('data', chunk =>
                  chunks.push(chunk)
                );

                audioResponse.data.on('end', resolve);

                audioResponse.data.on('error', reject);
              });

              audioBuffer = Buffer.concat(chunks);

              if (
                audioBuffer &&
                audioBuffer.length > 10000
              ) {
                downloadSuccess = true;
                console.log(`Stream success from ${apiMethod.name}`);
                break;
              }

            } catch (streamErr) {

              console.log(
                `${apiMethod.name} stream failed:`,
                streamErr.message
              );

              continue;
            }
          }

        } catch (apiErr) {

          console.log(
            `${apiMethod.name} API failed:`,
            apiErr.message
          );

          continue;
        }
      }

      // All failed
      if (!downloadSuccess || !audioBuffer) {
        throw new Error(
          'All download sources failed.'
        );
      }

      // Detect file format
      const firstBytes = audioBuffer.slice(0, 12);
      const hexSignature = firstBytes.toString('hex');
      const asciiSignature = firstBytes.toString('ascii', 4, 8);

      let actualMimetype = 'audio/mpeg';
      let fileExtension = 'mp3';
      let detectedFormat = 'unknown';

      // MP4/M4A
      if (
        asciiSignature === 'ftyp' ||
        hexSignature.startsWith('000000')
      ) {

        detectedFormat = 'M4A/MP4';
        actualMimetype = 'audio/mp4';
        fileExtension = 'm4a';
      }

      // MP3
      else if (
        audioBuffer.toString('ascii', 0, 3) === 'ID3' ||
        (
          audioBuffer[0] === 0xFF &&
          (audioBuffer[1] & 0xE0) === 0xE0
        )
      ) {

        detectedFormat = 'MP3';
        actualMimetype = 'audio/mpeg';
        fileExtension = 'mp3';
      }

      // OGG
      else if (
        audioBuffer.toString('ascii', 0, 4) === 'OggS'
      ) {

        detectedFormat = 'OGG';
        actualMimetype = 'audio/ogg';
        fileExtension = 'ogg';
      }

      // WAV
      else if (
        audioBuffer.toString('ascii', 0, 4) === 'RIFF'
      ) {

        detectedFormat = 'WAV';
        actualMimetype = 'audio/wav';
        fileExtension = 'wav';
      }

      console.log('Detected Format:', detectedFormat);

      // Convert to MP3 if needed
      let finalBuffer = audioBuffer;
      let finalMimetype = 'audio/mpeg';
      let finalExtension = 'mp3';

      if (fileExtension !== 'mp3') {

        try {

          finalBuffer = await toAudio(
            audioBuffer,
            fileExtension
          );

          if (
            !finalBuffer ||
            finalBuffer.length === 0
          ) {
            throw new Error(
              'Conversion failed'
            );
          }

        } catch (convErr) {

          console.log(
            'Conversion Error:',
            convErr.message
          );

          throw new Error(
            `Failed to convert ${detectedFormat} to MP3`
          );
        }
      }

      // Send audio
      await sock.sendMessage(chatId, {
        audio: finalBuffer,
        mimetype: finalMimetype,
        fileName:
`${(audioData.title || video.title || 'song')
  .replace(/[^\w\s-]/g, '')}.${finalExtension}`,
        ptt: false
      }, { quoted: msg });

      // Cleanup temp files
      try {

        const tempDir = path.join(
          __dirname,
          '../../temp'
        );

        if (fs.existsSync(tempDir)) {

          const files = fs.readdirSync(tempDir);
          const now = Date.now();

          files.forEach(file => {

            const filePath = path.join(tempDir, file);

            try {

              const stats = fs.statSync(filePath);

              if (
                now - stats.mtimeMs > 10000
              ) {

                if (
                  file.endsWith('.mp3') ||
                  file.endsWith('.m4a') ||
                  /^\d+\.(mp3|m4a)$/.test(file)
                ) {
                  fs.unlinkSync(filePath);
                }
              }

            } catch {}
          });
        }

      } catch {}

    } catch (err) {

      console.error('Song command error:', err);

      let errorMessage =
        '❌ Failed to download song.';

      if (
        err.message &&
        err.message.includes('blocked')
      ) {

        errorMessage =
          '❌ Content blocked in your region.';
      }

      else if (
        err.response?.status === 451
      ) {

        errorMessage =
          '❌ Content unavailable (451).';
      }

      else if (
        err.message &&
        err.message.includes('All download sources failed')
      ) {

        errorMessage =
          '❌ All download sources failed.';
      }

      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text: errorMessage
        },
        { quoted: msg }
      );
    }
  }
};
