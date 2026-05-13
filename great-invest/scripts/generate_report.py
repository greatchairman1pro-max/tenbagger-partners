"""
XO 자동화 스크립트 — 매일 06:10 KST 실행
GitHub Actions에서 호출됨. services/ 폴더 모듈 사용.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── 경로 설정 ────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
DATA_DIR  = ROOT / "dashboard" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")


# ── 1. 미국 주식 데이터 수집 ──────────────────────────────────
def fetch_us_top5() -> list[dict]:
    import yfinance as yf

    tickers = [
        "NVDA","AMD","MSFT","GOOGL","META","AVGO","QCOM",
        "INTC","MU","AMAT","LRCX","KLAC","ASML","TSM","ARM"
    ]
    results = []
    for ticker in tickers:
        try:
            hist = yf.Ticker(ticker).history(period="2d")["Close"]
            if len(hist) >= 2:
                change = round((hist.iloc[-1] / hist.iloc[-2] - 1) * 100, 2)
                results.append({
                    "name":   ticker,
                    "ticker": ticker,
                    "price":  round(float(hist.iloc[-1]), 2),
                    "change": change
                })
        except Exception:
            continue

    results.sort(key=lambda x: x["change"], reverse=True)
    return results[:5]


# ── 2. 국내 주식 수집 ─────────────────────────────────────────
def fetch_kr_stocks(theme_keywords: list[str]) -> list[dict]:
    import FinanceDataReader as fdr

    # 테마 키워드 → 종목코드 매핑 DB 로드
    db_path = ROOT / "data" / "theme_db.json"
    if not db_path.exists():
        return []
    with open(db_path, encoding="utf-8") as f:
        theme_db = json.load(f)

    # 키워드 매칭
    candidates = []
    for kw in theme_keywords:
        for key, codes in theme_db.items():
            if kw in key:
                candidates.extend(codes)

    results = []
    for code in list(dict.fromkeys(candidates))[:10]:
        try:
            df = fdr.DataReader(code, period="2d")
            if len(df) >= 2:
                change = round((df["Close"].iloc[-1] / df["Close"].iloc[-2] - 1) * 100, 2)
                results.append({
                    "name":   code,  # Gemini가 종목명으로 교체
                    "code":   code,
                    "price":  int(df["Close"].iloc[-1]),
                    "change": change
                })
        except Exception:
            continue

    results.sort(key=lambda x: x["change"], reverse=True)
    return results[:5]


# ── 3. Gemini API 분석 ────────────────────────────────────────
def analyze_with_gemini(us_stocks: list[dict]) -> dict:
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-1.5-flash")

    tickers_str = ", ".join(f"{s['ticker']}({s['change']:+.1f}%)" for s in us_stocks)

    # 테마 및 상승 이유 분석
    theme_prompt = f"""
오늘 미국 증시에서 가장 많이 오른 종목들입니다: {tickers_str}

다음 형식으로 JSON만 출력해주세요 (설명 없이):
{{
  "theme_name": "테마명 (예: 반도체 / AI 인프라)",
  "sector": "섹터명",
  "reasons": ["상승 이유 1 (30자 이내)", "상승 이유 2 (30자 이내)"],
  "kr_keywords": ["관련 국내 키워드1", "관련 국내 키워드2"]
}}
"""
    theme_res = model.generate_content(theme_prompt)
    theme_text = theme_res.text.strip().lstrip("```json").rstrip("```").strip()
    theme_data = json.loads(theme_text)

    # 쇼츠 대본 생성
    script_prompt = f"""
오늘 미국 증시 분석:
- 테마: {theme_data['theme_name']}
- 이유1: {theme_data['reasons'][0]}
- 이유2: {theme_data['reasons'][1]}
- 상위 종목: {tickers_str}

위 내용을 바탕으로 유튜브 쇼츠용 60초 대본을 작성해주세요.
조건: 구어체, 한국어, "TUBE입니다"로 시작, "구독과 좋아요" 로 마무리.
줄바꿈 포함해서 자연스럽게 작성.
"""
    script_res = model.generate_content(script_prompt)

    # 블로그 원고 생성
    blog_prompt = f"""
오늘 미국 증시 분석:
- 테마: {theme_data['theme_name']}
- 이유1: {theme_data['reasons'][0]}
- 이유2: {theme_data['reasons'][1]}

위 내용으로 블로그 포스팅용 원고를 작성하세요.
JSON으로만 출력:
{{
  "intro": "서론 (2~3문장)",
  "body": "본론 (3~4단락, 줄바꿈 포함)",
  "conclusion": "결론 (2~3문장, 면책 문구 포함)"
}}
"""
    blog_res = model.generate_content(blog_prompt)
    blog_text = blog_res.text.strip().lstrip("```json").rstrip("```").strip()
    blog_data = json.loads(blog_text)

    return {
        "theme":         theme_data,
        "shorts_script": script_res.text.strip(),
        "blog":          blog_data,
        "kr_keywords":   theme_data.get("kr_keywords", [])
    }


# ── 4. JSON 저장 + index 업데이트 ─────────────────────────────
def save_report(report: dict):
    out_path = DATA_DIR / f"{TODAY}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"✅ 저장 완료: {out_path}")

    # index.json 업데이트
    index_path = DATA_DIR / "index.json"
    if index_path.exists():
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    else:
        index = {"dates": []}

    if TODAY not in index["dates"]:
        index["dates"].insert(0, TODAY)
        index["dates"] = index["dates"][:30]  # 최근 30일만 유지

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


# ── Main ──────────────────────────────────────────────────────
def main():
    print(f"🚀 XO 리포트 생성 시작 — {TODAY}")

    print("  [1/4] 미국 주식 수집...")
    us_stocks = fetch_us_top5()

    print("  [2/4] Gemini 분석...")
    analysis = analyze_with_gemini(us_stocks)

    print("  [3/4] 국내 주식 수집...")
    kr_stocks = fetch_kr_stocks(analysis["kr_keywords"])

    report = {
        "date":          TODAY,
        "generated_at":  datetime.now(KST).isoformat(),
        "theme":         analysis["theme"],
        "us_stocks":     us_stocks,
        "kr_stocks":     kr_stocks,
        "shorts_script": analysis["shorts_script"],
        "blog":          analysis["blog"]
    }

    print("  [4/4] 저장...")
    save_report(report)
    print("✅ 완료")


if __name__ == "__main__":
    main()
