import { supabase } from "@/src/lib/supabase";

/**
 * 칭찬고래 AI 서버(whale-AI) 클라이언트.
 *
 * Supabase 가 아니라 별도 FastAPI 서버를 호출한다. user_id 는 보내지 않는다 —
 * 서버가 Authorization 헤더의 토큰에서 직접 꺼내 쓰기 때문이다.
 *
 * 흐름
 *   [AI 버튼]     원문 스냅샷(draftOriginal) + draftId 고정
 *   fetchWhaleMessage()   ← 몇 번을 호출하든 서버는 DB 에 쓰지 않는다
 *   [적용하기]
 *   saveWhaleMemory()     ← 여기서만 저장. 화면의 고친 텍스트가 아니라 원문을 보낸다
 */

const AI_API_URL = process.env.EXPO_PUBLIC_AI_API_URL;

// 한마디 생성은 임베딩 + GPT 호출이라 수 초가 걸린다. 응답이 영영 안 오는 경우에
// 시트가 로딩 상태로 멈춰 있지 않도록 상한을 둔다.
const REQUEST_TIMEOUT_MS = 30_000;

export type WhaleMessageParams = {
  /** AI 버튼을 누른 시점의 일기 원문 */
  diary: string;
  /** 초안 식별자. 같은 초안에서 재생성할 때는 같은 값을 유지한다 */
  draftId: string;
  /** "다른 한마디"를 누른 횟수 */
  retryCount?: number;
};

export type RejectedMessage = {
  /** 이 시도에서 나왔다가 "다른 한마디"로 거절된 한마디 */
  whaleMessage: string;
  retryCount: number;
};

export type SaveMemoryParams = {
  /** AI 버튼을 누른 시점의 원문. 유저가 고친 버전이 아니다 */
  originalText: string;
  draftId: string;
  /** "적용하기" 시점에 화면에 떠 있던 고래 한마디 */
  whaleMessage: string;
  /** "다른 한마디"를 누른 횟수 */
  retryCount: number;
  /** 같은 draft 안에서 whaleMessage 이전에 나왔다가 거절된 제안들 */
  rejectedMessages: RejectedMessage[];
};

export type FinalizeMemoryParams = {
  /** saveWhaleMemory 때 쓴 것과 같은 draftId */
  draftId: string;
  /** 실제로 "등록"된 최종 텍스트 */
  editedText: string;
};

/**
 * 초안 식별자를 만든다.
 *
 * 서버는 이 값으로 중복 저장을 막는다(같은 draftId 로 두 번 저장하면 두 번째는 무시).
 * 보안 토큰이 아니라 중복 판별용 키라서 암호학적 난수가 필요 없다. expo-crypto 는
 * 네이티브 모듈이라 추가하면 앱을 다시 빌드해야 하므로 쓰지 않는다.
 */
export function createDraftId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getAccessToken(): Promise<string> {
  // getSession 은 만료가 임박하면 토큰을 알아서 갱신해 준다.
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error("로그인이 필요합니다.");
  }

  return data.session.access_token;
}

async function requestAI<T>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  if (!AI_API_URL) {
    throw new Error("EXPO_PUBLIC_AI_API_URL 환경 변수를 확인해주세요.");
  }

  const token = await getAccessToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${AI_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.");
    }
    throw new Error("네트워크 연결을 확인해 주세요.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("로그인이 필요합니다.");
    }
    throw new Error("고래가 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.");
  }

  return (await response.json()) as T;
}

export type CrisisResource = {
  label: string;
  /** 전화번호. 있으면 시트에서 바로 걸 수 있는 버튼이 된다 */
  phone: string | null;
  url: string | null;
};

export type WhaleMessage = {
  message: string;
  /** 자해·자살 같은 위험 신호가 잡힌 글인지 (safety.is_risky) */
  isRisky: boolean;
  /** 위험 종류. 서버가 주는 문자열을 그대로 둔다 */
  riskType: string | null;
  /** 서버가 함께 내려준 상담 기관. 없으면 앱이 가진 기본 번호를 쓴다 */
  resources: CrisisResource[];
};

/**
 * 서버 응답의 safety 블록.
 *
 * level·categories·category_scores·action 은 지금 화면에서 쓰지 않아 받지 않는다.
 * 필요해지면 여기에 추가하면 된다.
 */
type SafetyPayload = {
  is_risky?: boolean;
  flagged?: boolean;
  risk_type?: string;
  resources?: Record<string, unknown>[];
};

/** resources 의 키 이름이 기관마다 달라서, 쓸 만한 후보를 순서대로 찾는다. */
function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readResources(safety: SafetyPayload | undefined): CrisisResource[] {
  if (!Array.isArray(safety?.resources)) {
    return [];
  }

  return safety.resources
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      label: pickString(item, ["name", "title", "label"]) ?? "상담 전화",
      // 서버(ai_safety.CRISIS_RESOURCES)는 phone_number/website 로 내려준다. 이 이름이 먼저다.
      phone: pickString(item, ["phone_number", "phone", "tel", "number", "contact"]),
      url: pickString(item, ["website", "url", "link", "href"]),
    }))
    // 연락할 방법이 없는 항목은 안내할 이유가 없다.
    .filter((resource) => resource.phone || resource.url);
}

/** 일기 원문으로 고래 한마디를 받아온다. 서버는 DB 에 쓰지 않는다. */
export async function fetchWhaleMessage({
  diary,
  draftId,
  retryCount = 0,
}: WhaleMessageParams): Promise<WhaleMessage> {
  const trimmed = diary.trim();
  if (!trimmed) {
    throw new Error("일기를 먼저 작성해 주세요.");
  }

  const data = await requestAI<{ whale: string; safety?: SafetyPayload }>("/ai/whale-message", {
    diary: trimmed,
    draft_id: draftId,
    retry_count: retryCount,
  });

  return {
    message: data.whale,
    // flagged 는 모더레이션이 걸렸다는 뜻이고, 안내를 띄울지는 is_risky 로 판단한다.
    isRisky: data.safety?.is_risky === true,
    riskType: data.safety?.risk_type ?? null,
    resources: readResources(data.safety),
  };
}

/**
 * 일기 원문을 장기기억에 저장한다. "적용하기"를 누른 시점에만 호출한다.
 *
 * 고친 버전이 아니라 원문을 보내는 이유: 고래의 한마디를 듣고 다듬은 글은 이미
 * 긍정적으로 재구성돼 있어서, 나중에 비슷한 감정을 찾을 때 원래 감정과 멀어진다.
 */
export async function saveWhaleMemory({
  originalText,
  draftId,
  whaleMessage,
  retryCount,
  rejectedMessages,
}: SaveMemoryParams): Promise<void> {
  const trimmed = originalText.trim();
  if (!trimmed) {
    return;
  }

  await requestAI<{ ok: boolean }>("/ai/memory", {
    original_text: trimmed,
    draft_id: draftId,
    whale_message: whaleMessage,
    retry_count: retryCount,
    rejected_messages: rejectedMessages.map((m) => ({
      whale_message: m.whaleMessage,
      retry_count: m.retryCount,
    })),
  });
}

/**
 * "적용하기" 이후 실제로 등록된 최종 텍스트를 같은 draftId 행에 채워 넣는다.
 *
 * "등록"을 눌러 게시글 저장이 성공한 직후에만 호출한다. 적용만 하고 등록을
 * 안 했다면 이 함수는 호출되지 않고, 서버의 edited_text는 계속 NULL로 남는다.
 */
export async function finalizeWhaleMemory({
  draftId,
  editedText,
}: FinalizeMemoryParams): Promise<void> {
  const trimmed = editedText.trim();
  if (!trimmed) {
    return;
  }

  await requestAI<{ ok: boolean }>(
    "/ai/memory",
    {
      draft_id: draftId,
      edited_text: trimmed,
    },
    "PATCH",
  );
}
