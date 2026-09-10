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
    // 1. Tạo ngẫu nhiên device_id và web_id gồm 19 chữ số bắt đầu bằng 74
    const randId = () => "74" + Math.floor(10000000000000000 + Math.random() * 90000000000000000).toString().slice(0, 17);
    const deviceId = randId();
    const webId = randId();

    // 2. Query URL chuẩn theo Doubao Python Reverse Client
    const params = new URLSearchParams({
      speaker: speaker,
      format: "mp3",
      speech_rate: "0",
      pitch: "0",
      version_code: "20800",
      language: "zh",
      device_platform: "web",
      aid: "497858",
      real_aid: "497858",
      pkg_type: "release_version",
      device_id: deviceId,
      pc_version: "2.46.3",
      web_id: webId,
      tea_uuid: webId,
      region: "",
      sys_region: "",
      samantha_web: "1",
      "use-olympus-account": "1"
    });

    const wsUrl = `wss://ws-samantha.doubao.com/samantha/audio/tts?${params.toString()}`;

    // 3. Headers giả lập chính xác trình duyệt
    const ws = new WebSocket(wsUrl, {
      headers: {
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Origin": "https://www.doubao.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie
      }
    });

    const audioChunks = [];
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Doubao timeout (15s)"));
    }, 15000);

    ws.on('open', () => {
      // Gửi event phát text
      ws.send(JSON.stringify({ event: "text", text: text }));
      ws.send(JSON.stringify({ event: "finish" }));
    });

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        audioChunks.push(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "sentence_end" || (msg.code && msg.code !== 0)) {
            clearTimeout(timer);
            setTimeout(() => ws.close(), 250);
          }
        } catch (e) {}
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(new Error("Không nhận được dữ liệu âm thanh từ Doubao (hãy kiểm tra lại 3 khóa Cookie)"));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
