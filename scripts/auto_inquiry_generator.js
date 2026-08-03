const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'uptech-web-client';

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY secret is required.");
  process.exit(1);
}

// 1. Gemini API를 호출하여 자연스러운 회사명/아이디 및 짧은 제목 생성
async function generateInquiryWithGemini() {
  const prompt = `
Generate a JSON object for 1 realistic business inquiry on a company bulletin board.
Fields required:
1. "author": Use ONLY a company name (e.g., '(주)세원정밀', '한성솔루션', 'S-Tech Corp', '미래옵틱스', '대진테크', '신성엔지니어링', 'Core Tech') or simple English ID (e.g., 'rnd_qa', 'laser_tech99', 'micro_process', 'optics_dev'). Do NOT use real person names.
2. "title": Extremely short variations of "문의드립니다" (e.g. "문의드립니다", "문의드립니다.", "문의 드립니다", "문의.").

Return ONLY valid JSON format without markdown ticks:
{"author": "...", "title": "..."}
`;

  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (res.ok) {
        const data = await res.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(rawText);
      }
    } catch (e) {
      console.warn(`Model ${model} failed, trying next...`, e.message);
    }
  }

  // Fallback if API key has issues
  const companies = ['(주)한양정밀', '세원솔루션', 'S-Tech Micro', '미래테크놀로지', 'tech_user88', '(주)대진세미콘'];
  const titles = ['문의드립니다', '문의드립니다.', '문의 드립니다', '문의.'];
  return {
    author: companies[Math.floor(Math.random() * companies.length)],
    title: titles[Math.floor(Math.random() * titles.length)]
  };
}

// 2. Firestore REST API를 이용해 비밀글 문의 문서 생성 (일과시간 랜덤 분산 적용)
async function postToFirestore(inquiry) {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  // 자연스러운 분 오프셋 (-15분 ~ +15분 무작위 변동)
  const randomMinOffset = Math.floor(Math.random() * 30) - 15;
  const kstDate = new Date(now.getTime() + kstOffset + (randomMinOffset * 60 * 1000));
  
  const year = kstDate.getFullYear();
  const month = String(kstDate.getMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getDate()).padStart(2, '0');
  const hours = String(kstDate.getHours()).padStart(2, '0');
  const mins = String(kstDate.getMinutes()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day} ${hours}:${mins}`;

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts`;
  
  const payload = {
    fields: {
      boardType: { stringValue: 'free' },
      title: { stringValue: inquiry.title || '문의드립니다.' },
      content: { stringValue: '' },
      author: { stringValue: inquiry.author || '고객사' },
      createdAt: { stringValue: dateStr },
      viewCount: { integerValue: '0' },
      isPinned: { booleanValue: false },
      isSecret: { booleanValue: true },
      password: { stringValue: 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f' }
    }
  };

  const res = await fetch(firestoreUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    console.log(`[SUCCESS] Automatically created inquiry: [${inquiry.author}] ${inquiry.title} (${dateStr})`);
  } else {
    const errorText = await res.text();
    console.error("[ERROR] Failed to post to Firestore:", res.status, errorText);
    process.exit(1);
  }
}

async function main() {
  // 수동 실행(workflow_dispatch)이 아닐 때 확률적(75%)으로 실행되어 하루 1~3개가 불규칙하게 올라가도록 설정
  const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (!isManualRun) {
    const randomChance = Math.random();
    // 75% 확률로 게시글 생성, 25% 확률로 패스 (하루 1~3개 무작위 조율)
    if (randomChance > 0.75) {
      console.log(`[SKIP] Random skip triggered (chance: ${randomChance.toFixed(2)}). Will run next schedule slot.`);
      return;
    }
  }

  console.log("Starting business-hours automated inquiry post generation via Gemini AI...");
  const inquiry = await generateInquiryWithGemini();
  await postToFirestore(inquiry);
}

main();
