import WebSocket from 'ws';

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  // 1. Cấu hình Headers CORS cho phép GitHub Pages truy cập
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // 2. Bắt buộc trả về HTTP 200 OK cho yêu cầu preflight OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, speaker = "zh_male_yangguang_conversation_v4_wvae_bigtts" } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: "Thiếu nội dung text" });
  }

  const cookie = process.env.DOUBAO_COOKIE;
  if (!cookie) {
    return res.status(500).json({ error: "Chưa cấu hình DOUBAO_COOKIE trên Vercel" });
  }

  try {
    const audioBuffer = await getDoubaoAudio(text, speaker, cookie);
    res.setHeader("Content-Type", "audio/mpeg");
    return res.send(audioBuffer);
  } catch (error) {
    console.error("Lỗi Doubao Server:", error);
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
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Doubao WebSocket Timeout sau 15s"));
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
          if (msg.event === "sentence_end" || (msg.code && msg.code !== 0)) {
            clearTimeout(timer);
            ws.close();
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error("Không nhận được luồng nhị phân audio từ Doubao"));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
