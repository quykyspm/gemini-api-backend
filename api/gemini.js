export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });

  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // Danh sách các model theo thứ tự ưu tiên
// Danh sách model ưu tiên từ quota cao (500 lượt) đến thấp
  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      const data = await response.json();

      // Nếu thành công và có nội dung trả về
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ 
          text: data.candidates[0].content.parts[0].text,
          usedModel: model 
        });
      }

      // Nếu lỗi quota (429) hoặc model không khả dụng, lưu lỗi rồi nhảy sang model tiếp theo
      lastError = data.error?.message || "Lỗi không xác định từ Gemini";
      console.warn(`Model ${model} thất bại: ${lastError}. Đang thử model tiếp theo...`);
    } catch (err) {
      lastError = err.message;
    }
  }

  // Nếu tất cả model trong danh sách đều hết lượt
  return res.status(500).json({ 
    error: `Tất cả các model đều quá tải hoặc hết lượt gọi hôm nay: ${lastError}` 
  });
}
