// api/tts.js (Deploy trên Vercel)
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text, voice = "zh-CN-YunxiNeural", rate = "0%" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    // Gọi Edge TTS endpoint chuẩn của Microsoft
    // Định dạng SSML
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
      <voice name='${voice}'>
        <prosody rate='${rate}' pitch='-2Hz'>
          ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </prosody>
      </voice>
    </speak>`;

    // Trả về dữ liệu âm thanh hoặc cấu hình cho frontend
    return res.status(200).json({ success: true, ssml, voice });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
