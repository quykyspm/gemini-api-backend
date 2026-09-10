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
  if (!text) return res.status(400).json({ error: "Thiếu text" });

  const cookie = process.env.DOUBAO_COOKIE;
  if (!cookie) return res.status(500).json({ error: "Chưa cấu hình DOUBAO_COOKIE" });

  try {
    const audioBuffer = await getDoubaoAudio(text, speaker, cookie);
    
    // Nếu dữ liệu âm thanh quá nhỏ (dưới 1000 bytes) -> Không phải audio hợp lệ
    if (audioBuffer.length < 1000) {
      return res.status(500).json({ 
        error: "Dữ liệu âm thanh nhận về không hợp lệ", 
        raw: audioBuffer.toString() 
      });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    return res.send(audioBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function getDoubaoAudio(text, speaker, cookie) {
  return new Promise((resolve, reject) => {
    const deviceId = "74" + Math.floor(10000000000000000 + Math.random() * 90000000000000000).toString().slice(0, 17);
    const webId = "74" + Math.floor(10000000000000000 + Math.random() * 90000000000000000).toString().slice(0, 17);
    
    // Endpoint chuẩn theo client Python đảo ngược
    const wsUrl = `wss://ws-samantha.doubao.com/samantha/audio/tts?speaker=${speaker}&format=mp3&speech_rate=0&pitch=0&language=zh&device_platform=web&aid=497858&version_code=20800&pc_version=2.46.3&device_id=${deviceId}&web_id=${webId}&samantha_web=1&use-olympus-account=1`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        "Origin": "https://www.doubao.com",
        "Referer": "https://www.doubao.com/",
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const audioChunks = [];
    const timer = setTimeout(() => {
      ws.terminate();
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(new Error("Doubao timeout (15s)"));
      }
    }, 15000);

    ws.on('open', () => {
      // Gửi event text và finish theo đúng giao thức đảo ngược
      ws.send(JSON.stringify({ event: "text", text: text }));
      ws.send(JSON.stringify({ event: "finish" }));
    });

    ws.on('message', (data) => {
      // Dữ liệu nhị phân là các đoạn âm thanh MP3
      if (Buffer.isBuffer(data)) {
        audioChunks.push(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "sentence_end" || (msg.code && msg.code !== 0)) {
            clearTimeout(timer);
            // Chờ thêm 300ms để nhận nốt các chunk binary cuối cùng trước khi đóng
            setTimeout(() => {
              ws.close();
            }, 300);
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(audioChunks));
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
