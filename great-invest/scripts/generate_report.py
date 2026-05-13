import json, os, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yfinance as yf
import google.generativeai as genai

ROOT     = Path(__file__).parent.parent
DATA_DIR = ROOT / "dashboard" / "data"
KST      = timezone(timedelta(hours=9))
TODAY    = datetime.now(KST).strftime("%Y-%m-%d")
NOTE     = "반드시 JSON만 출력. 설명·markdown 없이. 숫자는 따옴표 없이."


def fetch_us_stocks():
    tickers = ["NVDA","AMD","MSFT","GOOGL","META","AVGO","QCOM","TSM","ARM","MU"]
    results = []
    for t in tickers:
        try:
            h = yf.Ticker(t).history(period="2d")["Close"]
            if len(h) >= 2:
                results.append({
                    "name": t, "ticker": t,
                    "price": round(float(h.iloc[-1]), 2),
                    "change": round((h.iloc[-1] / h.iloc[-2] - 1) * 100, 2)
                })
        except Exception:
            pass
    return sorted(results, key=lambda x: x["change"], reverse=True)[:5]


def call_ai(prompt):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")
    return model.generate_content(prompt).text


def parse_json(text):
    m = re.search(r"```json\s*([\s\S]*?)```", text)
    if m:
        return json.loads(m.group(1))
    s, e = text.find("{"), text.rfind("}")
    if s >= 0 and e > s:
        return json.loads(text[s:e+1])
    raise ValueError("JSON 파싱 실패")


def save(agent, data):
    out = DATA_DIR / agent
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{TODAY}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    idx_path = DATA_DIR / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"dates": []}
    if TODAY not in idx["dates"]:
        idx["dates"].insert(0, TODAY)
        idx["dates"] = idx["dates"][:30]
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    print(f"🚀 XO 리포트 — {TODAY}")

    us = fetch_us_stocks()
    us_str = "\n".join(f"{s['ticker']}: ${s['price']} ({s['change']:+.2f}%)" for s in us)

    prompts = {
        "market": (
            f"오늘({TODAY}) 미국 주식:\n{us_str}\n\n{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"market","theme":{{"name":"테마명","reasons":["이유1","이유2"]}},'
            f'"us_stocks":[{{"name":"종목명","ticker":"티커","price":0.0,"change":0.0}}],'
            f'"kr_stocks":[{{"name":"종목명","code":"6자리","price":0,"change":0.0}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"us_stocks 5개, kr_stocks 5개."
        ),
        "technical": (
            f"오늘({TODAY}) 코스피/코스닥 2일 연속 상승 종목 분석.\n\n{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"technical","title":"코스피 2일 연속 상승 종목",'
            f'"market_summary":"코스피 현황 한줄",'
            f'"stocks":[{{"name":"종목명","code":"6자리","price":0,"day1":0.0,"day2":0.0,"total":0.0,"volume_ratio":0.0,"signal":"이유"}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"stocks 5개."
        ),
        "sector": (
            f"오늘({TODAY}) 글로벌 섹터별 강세 종목. 미국 데이터:\n{us_str}\n\n{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"sector","title":"섹터별 강세 종목",'
            f'"foreign":[{{"sector":"섹터명","stocks":[{{"name":"종목명","ticker":"티커","price":0.0,"change":0.0}}]}}],'
            f'"domestic":[{{"sector":"섹터명","stocks":[{{"name":"종목명","code":"6자리","price":0,"change":0.0}}]}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"foreign 3섹터, domestic 3섹터."
        ),
    }

    failed = []
    for agent, prompt in prompts.items():
        print(f"  AI — {agent} 분석 중...")
        try:
            raw = call_ai(prompt)
            print(f"  [RAW] {raw[:200]}")
            data = parse_json(raw)
            save(agent, data)
            print(f"  ✅ {agent} 완료")
        except Exception as e:
            import traceback
            print(f"  ❌ {agent} 실패: {e}")
            traceback.print_exc()
            failed.append(agent)

    if len(failed) == len(prompts):
        raise SystemExit(f"❌ 모든 에이전트 실패: {failed}")
    print("✅ 전체 완료")


if __name__ == "__main__":
    main()
