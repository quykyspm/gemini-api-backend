import WebSocket from 'ws';

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://quykyspm.github.io");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const { text, speaker = "zh_male_yangguang_conversation_v4_wvae_bigtts" } = req.body || {};
  if (!text) return res.status(400).json({ error: "Thiếu trường text" });

  const cookie = process.env.DOUBAO_COOKIE;
  if (!cookie) {
    console.error("LỖI: Biến môi trường DOUBAO_COOKIE chưa được thiết lập!");
    return res.status(500).json({ error: "Chưa thiết lập biến DOUBAO_COOKIE trên Vercel" });
  }

  try {
    const audioBuffer = await getDoubaoAudio(text, speaker, cookie);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    return res.send(audioBuffer);
  } catch (error) {
    console.error("Doubao WebSocket Error:", error.message);
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
        "Cookie": cookie,
        "Origin": "https://www.doubao.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const chunks = [];
    let receivedAudio = false;

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Doubao timeout (15s)"));
    }, 15000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: "text", text: text }));
      ws.send(JSON.stringify({ event: "finish" }));
    });

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        chunks.push(data);
        receivedAudio = true;
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "sentence_end" || (msg.code && msg.code !== 0)) {
            clearTimeout(timeout);
            ws.close();
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (receivedAudio && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error("Không nhận được dữ liệu âm thanh từ Doubao (kiểm tra lại Cookie)"));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
