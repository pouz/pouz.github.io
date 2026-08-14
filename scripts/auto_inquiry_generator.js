const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'uptech-web-client';

// 1. API 키를 환경변수 또는 Firestore _settings_gemini 문서에서 자동 로드
async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts/_settings_gemini`;
    const res = await fetch(settingsUrl);
    if (res.ok) {
      const doc = await res.json();
      const key = doc.fields?.apiKey?.stringValue;
      if (key && key.trim().length > 0) {
        console.log("[INFO] Successfully loaded Gemini API key from Firestore settings.");
        return key.trim();
      }
    }
  } catch (e) {
    console.warn("[WARN] Could not fetch Gemini API key from Firestore:", e.message);
  }
  return null;
}

// 2. Google AI API (Gemini)를 호출하여 100% 독창적인 가상 문의글 생성
async function generateInquiryWithGemini(apiKey) {
  if (!apiKey) {
    console.warn("[SKIP] No Gemini API key provided. Skipping post creation (AI generation only).");
    return null;
  }

  const isDetailedTitle = Math.random() < 0.2; // 20% (1:4 비율)

  const titleGuidance = isDetailedTitle
    ? `Detailed & technical style (e.g. "0.12t/0.08t 다중 단차 마스크 가공 견적 및 납기 문의", "BGA 0.4p 패키징용 나노코팅 메탈마스크 단가 및 사양 문의", "FPCB 레이저 라우팅 3,000ea 가공 스펙 문의")`
    : `Simple, brief, casual style (e.g. "견적 문의드립니다", "단차마스크 문의", "도면 메일 확인 부탁드립니다", "문의드립니다.", "메탈마스크 단가 문의", "견적 요청", "가공 문의", "도면 발송 확인 요청", "메탈마스크 제작 문의드립니다")`;

  // 1:1:1 비율로 회사명(0), 영문 ID(1), 일반 실명(2) 균등 분배
  const authorMode = Math.floor(Math.random() * 3);
  let authorRule = '';
  let emailRule = '';

  if (authorMode === 0) {
    authorRule = `You MUST generate a realistic Korean electronics/SMT/manufacturing company name (e.g. '(주)세원정밀', '동양솔루션', '(주)대성하이텍', '신성엔지니어링', '에스엠테크', '한성마이크로', '제이텍시스템', '대영정밀', '진성전자', '(주)유진테크', '삼우정밀'). Do NOT output a person name or ID.`;
    emailRule = `A company/corporate sales or contact email (e.g. 'contact@sewon-tech.co.kr', 'sales@dongyang.co.kr', 'purchase@daesung-ht.com', 'info@shinsung-eng.com', 'order@sm-tech.co.kr').`;
  } else if (authorMode === 1) {
    authorRule = `You MUST generate a realistic internet/portal user ID in English/alphanumeric format (e.g. 'tech_minsu', 'dh_kim92', 'smt_master', 'speed_pcb', 'jin_woo88', 'circuit_lab', 'laser_cut77', 'pro_qa', 'nano_smt', 'pcb_design84', 'clean_mask99'). Do NOT output a Korean person name or company.`;
    emailRule = `A personal portal email matching the user ID (e.g. 'tech_minsu@naver.com', 'smt_master@daum.net', 'dh_kim92@gmail.com').`;
  } else {
    authorRule = `You MUST generate a 3-character plain Korean person name strictly without any job titles (e.g. '김민수', '박철민', '이수진', '정성훈', '최지훈', '강현우', '윤서연', '송재호', '한태우', '임채원'). Do NOT output a company name or user ID.`;
    emailRule = `A natural portal or personal email (e.g. 'min.su.kim92@naver.com', 'chulmin.park@gmail.com', 'sujin.lee@daum.net').`;
  }

  const prompt = `
You are a simulator generating realistic Korean customer inquiries on an SMT Metal Mask manufacturing company (UPTech) bulletin board.
Do NOT use fixed, repetitive, or generic placeholder names. Generate completely creative, realistic inquiry topics each time.

Generate a single JSON object with these fields:
1. "author": ${authorRule}
2. "email": ${emailRule}
3. "title": A realistic Korean inquiry title following this required style: ${titleGuidance}.
4. "content": A realistic customer inquiry message (1-2 sentences).
5. "isSecret": boolean (randomly true or false, ~70% chance true).

Do NOT wrap with markdown blocks. Output pure valid JSON only.
{"author": "...", "email": "...", "title": "...", "content": "...", "isSecret": true}
`;

  const priorityModels = [
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemma-4-26b-a4b-it',
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];
  let candidateModels = [];

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    if (listRes.ok) {
      const listData = await listRes.json();
      const discovered = (listData.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));

      for (const pm of priorityModels) {
        if (discovered.includes(pm)) {
          candidateModels.push(pm);
        }
      }
      for (const dm of discovered) {
        if (!candidateModels.includes(dm) && !dm.includes('tts') && !dm.includes('image')) {
          candidateModels.push(dm);
        }
      }
    }
  } catch (e) {
    console.warn("[WARN] listModels query failed:", e.message);
  }

  if (candidateModels.length === 0) {
    candidateModels = priorityModels;
  }

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);
        parsed.authorType = 'ai'; // AI 생성 배지용 플래그
        console.log(`[SUCCESS] Generated inquiry via Gemini API model (${model})`);
        return parsed;
      }
    } catch (e) {
      // Try next candidate model
    }
  }

  console.warn("[SKIP] All Gemini AI models failed or timed out. Post generation skipped (AI generation only).");
  return null;
}

const crypto = require('crypto');

// 3. Firestore REST API를 이용해 게시글 등록
async function postToFirestore(inquiry) {
  if (!inquiry) return;

  const now = new Date();
  // UTC 타임스탬프 계산 후 대한민국 표준시(KST = UTC+9) 정확히 적용
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const randomMinOffset = Math.floor(Math.random() * 20) - 10;
  const kstDate = new Date(utc + (9 * 3600000) + (randomMinOffset * 60000));
  
  const year = kstDate.getFullYear();
  const month = String(kstDate.getMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getDate()).padStart(2, '0');
  const hours = String(kstDate.getHours()).padStart(2, '0');
  const mins = String(kstDate.getMinutes()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day} ${hours}:${mins}`;

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts`;
  
  const isSecret = inquiry.isSecret !== undefined ? Boolean(inquiry.isSecret) : Math.random() < 0.7;
  const authorType = inquiry.authorType || 'ai';

  // 4~6자리 무작위 비밀번호 생성 후 SHA-256 해시값 저장
  const passLength = 4 + Math.floor(Math.random() * 3);
  let randomPass = '';
  for (let i = 0; i < passLength; i++) {
    randomPass += Math.floor(Math.random() * 10).toString();
  }
  const passwordHash = crypto.createHash('sha256').update(randomPass).digest('hex');

  const payload = {
    fields: {
      boardType: { stringValue: 'free' },
      title: { stringValue: inquiry.title },
      content: { stringValue: inquiry.content },
      author: { stringValue: inquiry.author },
      email: { stringValue: inquiry.email },
      authorType: { stringValue: authorType },
      createdAt: { stringValue: dateStr },
      viewCount: { integerValue: '1' },
      isPinned: { booleanValue: false },
      isSecret: { booleanValue: isSecret },
      password: { stringValue: passwordHash }
    }
  };

  const res = await fetch(firestoreUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    console.log(`[SUCCESS] Created inquiry post (isSecret: ${isSecret}, authorType: ${authorType}): [${inquiry.author} <${inquiry.email}>] ${inquiry.title} (${dateStr})`);
  } else {
    const errorText = await res.text();
    console.error("[ERROR] Failed to post to Firestore:", res.status, errorText);
    process.exit(1);
  }
}

async function main() {
  const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || !process.env.GITHUB_EVENT_NAME;
  if (!isManualRun) {
    const randomChance = Math.random();
    // 75% 확률로 게시글 생성, 25% 확률로 패스 (하루 1~3개 무작위 조율)
    if (randomChance > 0.75) {
      console.log(`[SKIP] Random skip triggered (chance: ${randomChance.toFixed(2)}). Will run next schedule slot.`);
      return;
    }
  }

  console.log("Starting automated inquiry post generation (AI only)...");
  const apiKey = await getGeminiApiKey();
  const inquiry = await generateInquiryWithGemini(apiKey);
  if (inquiry) {
    await postToFirestore(inquiry);
  }
}

main();
