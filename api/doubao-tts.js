// api/doubao-tts.js
import WebSocket from 'ws';

export const config = {
  maxDuration: 30, // Cho phép chạy tối đa 30s
};

export default async function handler(req, res) {
  // Cấu hình CORS để web GitHub Pages gọi sang được
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Chỉ chấp nhận POST" });

  const { text, speaker = "zh_male_yangguang_conversation_v4_wvae_bigtts" } = req.body;
  if (!text) return res.status(400).json({ error: "Thiếu nội dung text" });

  const cookie = process.env.DOUBAO_COOKIE;
  if (!cookie) return res.status(500).json({ error: "Chưa cấu hình DOUBAO_COOKIE trên Vercel" });

  try {
    const audioBuffer = await getDoubaoAudio(text, speaker, cookie);
    res.setHeader("Content-Type", "audio/mpeg");
    return res.send(audioBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function getDoubaoAudio(text, speaker, cookie) {
  return new Promise((resolve, reject) => {
    const deviceId = "74" + Math.floor(Math.random() * 10000000000000000);
    const webId = "74" + Math.floor(Math.random() * 10000000000000000);
    const wsUrl = `wss://ws-samantha.doubao.com/samantha/audio/tts?speaker=${speaker}&format=mp3&speech_rate=0&pitch=0&language=zh&device_platform=web&aid=497858&device_id=${deviceId}&web_id=${webId}&samantha_web=1`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        "Origin": "https://www.doubao.com",
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const chunks = [];
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Doubao TTS phản hồi quá lâu (Timeout)"));
    }, 15000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: "text", text: text }));
      ws.send(JSON.stringify({ event: "finish" }));
    });

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        chunks.push(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "sentence_end" || msg.code !== 0) {
            clearTimeout(timeout);
            ws.close();
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error("Không nhận được dữ liệu âm thanh từ Doubao"));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
