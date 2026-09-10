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
    // 1. Khởi tạo device_id và web_id ngẫu nhiên 19 chữ số
    const randId = () => "74" + Math.floor(10000000000000000 + Math.random() * 90000000000000000).toString().slice(0, 17);
    const deviceId = randId();
    const webId = randId();

    // 2. Sử dụng endpoint WebSocket mới của Doubao
    const wsUrl = `wss://frontier-audio-web-ws.doubao.com/api/v2/sami/voicegenie?api_app_key=GOqQpfo1fO7slHv8&namespace=VoiceGenie&version_code=20800&language=zh&device_platform=web&pkg_type=release_version&aid=497858&device_id=${deviceId}&web_id=${webId}&tea_uuid=${webId}&samantha_web=1&use-olympus-account=1`;

    // 3. Giả lập đầy đủ các Header chuẩn của trình duyệt để tránh bị chặn 200 OK
    const ws = new WebSocket(wsUrl, {
      headers: {
        "Origin": "https://www.doubao.com",
        "Referer": "https://www.doubao.com/",
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const chunks = [];
    let receivedAudio = false;

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Doubao timeout kết nối sau 15s"));
    }, 15000);

    ws.on('open', () => {
      // Gửi event phát văn bản kèm cấu hình voice
      const payload = {
        action: "speak",
        speaker: speaker,
        format: "mp3",
        text: text
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        chunks.push(data);
        receivedAudio = true;
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "sentence_end" || msg.is_end || (msg.code && msg.code !== 0)) {
            clearTimeout(timer);
            ws.close();
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (receivedAudio && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error("Không nhận được dữ liệu âm thanh từ Doubao (vui lòng kiểm tra lại Cookie)"));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
