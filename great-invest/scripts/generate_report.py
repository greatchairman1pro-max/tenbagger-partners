import json, os, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yfinance as yf
from groq import Groq

ROOT     = Path(__file__).parent.parent
DATA_DIR = ROOT / "dashboard" / "data"
KST      = timezone(timedelta(hours=9))
TODAY    = datetime.now(KST).strftime("%Y-%m-%d")

# ── 나스닥 상위 200 검증된 종목 ───────────────────────────────
NASDAQ_200 = [
    # 빅테크
    "NVDA","MSFT","AAPL","AMZN","META","GOOGL","TSLA","AVGO","COST","NFLX",
    # 반도체
    "AMD","QCOM","AMAT","LRCX","MU","KLAC","ADI","MRVL","INTC","TXN",
    "MCHP","MPWR","ONTO","WOLF","KLIC","COHU","AMBA","CRUS","SLAB","DIOD",
    "RMBS","SMTC","SYNA","ACMR","VICR","POWI","MTSI","AOSL","SWKS","QRVO",
    # 소프트웨어/클라우드
    "INTU","CDNS","SNPS","NOW","CRM","WDAY","ADBE","ORCL","PANW","CRWD",
    "ZS","FTNT","OKTA","TEAM","SNOW","DDOG","PLTR","SHOP","ZM","DOCU",
    "TWLO","HUBS","GTLB","CFLT","MDB","BILL","TTD","RBLX","SPOT","HOOD",
    # 바이오/헬스
    "ISRG","IDXX","DXCM","AMGN","GILD","VRTX","REGN","BIIB","MRNA","ALNY",
    # 기타 나스닥 우량주
    "ARM","SMCI","ASML","COIN","SOFI","PYPL","UBER","ABNB","EBAY","ETSY",
    "LYFT","DASH","SE","NU","MELI","BIDU","JD","PDD","BABA","NTES",
    "MNST","CELH","TMUS","CMCSA","CHTR","WBD","FOXA","PSTG","NTAP","CIEN",
]

# ── 코스피 상위 200 검증된 종목 (yfinance 실데이터 확인) ──────
KOSPI_200 = [
    # 시총 상위 대형주
    "005930","000660","373220","005380","000270","051910","068270","035420",
    "012330","028260","066570","009150","034730","055550","015760","096770",
    "003670","033780","030200","017670","032830","086790","316140","105560",
    # 제조/중공업
    "207940","247540","042700","058470","403870","039030","090430","271560",
    "282330","097950","009830","267250","078930","034020","042660","329180",
    "003490","138040","000810","006800","139480","010130","011200","003550",
    # 금융
    "086280","032640","010950","023590","088350","091810","095570","097780",
    # 반도체/전자부품
    "036570","064350","066970","079550","040910","039490","052690","053800",
    "058820","060980","082640","085620","093050","104480","108670","128940",
    # 바이오/제약
    "068760","326030","145020","180640","185750","192080","194370","206950",
    # 소비재/유통
    "069460","071050","075580","078340","096530","099140","120030","122630",
    # 화학/소재
    "004020","011780","014830","016360","017800","018260","019170","024110",
    "025540","026960","027410","029780","033240","034120","035250","036830",
    "037270","043370","044820","047050","047810","051600","054620","055490",
    "063160","067160","072130","073010","084370","111770","123690","131970",
    "145210","145720","151860","181710","196490","200130","208140","214150",
    "215000","225190","228760","229640","232140","234080","241590","244920",
    "245620","251270","252670","253450","256840","263750","267290","271940",
    "272210","278280","285130","286940","290650","293490","294870","298050",
    "299660","306200","308170","319400","322000","323410","328130","336260",
    "337930","347860","352820","357780","363280","365550",
]

SYSTEM = (
    "당신은 한국 주식시장 분석 전문가입니다. "
    "반드시 순수한 한국어(한글)와 영문 알파벳, 숫자만 사용하세요. "
    "한자·일본어·중국어·베트남어 등 다른 언어 문자를 절대 사용하지 마세요. "
    "JSON 출력 시 모든 문자열은 한글+영문+숫자만 포함해야 합니다."
)


def fetch_us_top_gainers():
    """나스닥 상위 200종목 중 당일 상승률 상위 10종목 반환"""
    print("  미국 주식 데이터 수집 중...")
    try:
        data = yf.download(NASDAQ_200, period="2d", auto_adjust=True, progress=False)["Close"]
    except Exception as e:
        print(f"  배치 다운로드 실패: {e}")
        return []

    results = []
    for t in NASDAQ_200:
        try:
            col = data[t] if t in data.columns else None
            if col is None:
                continue
            prices = col.dropna()
            if len(prices) < 2:
                continue
            change = (prices.iloc[-1] / prices.iloc[-2] - 1) * 100
            results.append({
                "ticker": t,
                "price": round(float(prices.iloc[-1]), 2),
                "change": round(float(change), 2),
            })
        except Exception:
            pass

    return sorted(results, key=lambda x: x["change"], reverse=True)[:10]


def fetch_kr_stocks():
    """코스피 상위 200종목 당일 시세 반환"""
    print("  국내 주식 데이터 수집 중...")
    ks_tickers = [f"{c}.KS" for c in KOSPI_200]
    try:
        data = yf.download(ks_tickers, period="3d", auto_adjust=True, progress=False)["Close"]
    except Exception as e:
        print(f"  국내 배치 다운로드 실패: {e}")
        return []

    results = []
    for code, ticker in zip(KOSPI_200, ks_tickers):
        try:
            col = data[ticker] if ticker in data.columns else None
            if col is None:
                continue
            prices = col.dropna()
            if len(prices) < 2:
                continue
            change = (prices.iloc[-1] / prices.iloc[-2] - 1) * 100
            results.append({
                "code": code,
                "ticker": ticker,
                "price": int(prices.iloc[-1]),
                "change": round(float(change), 2),
            })
        except Exception:
            pass

    return sorted(results, key=lambda x: x["change"], reverse=True)


def fetch_kr_consecutive():
    """코스피 상위 200종목 중 2일 연속 상승 종목"""
    print("  연속 상승 종목 수집 중...")
    ks_tickers = [f"{c}.KS" for c in KOSPI_200]
    try:
        data = yf.download(ks_tickers, period="4d", auto_adjust=True, progress=False)["Close"]
    except Exception:
        return []

    results = []
    for code, ticker in zip(KOSPI_200, ks_tickers):
        try:
            col = data[ticker] if ticker in data.columns else None
            if col is None:
                continue
            prices = col.dropna()
            if len(prices) < 3:
                continue
            d1 = (prices.iloc[-2] / prices.iloc[-3] - 1) * 100
            d2 = (prices.iloc[-1] / prices.iloc[-2] - 1) * 100
            if d1 > 0 and d2 > 0:
                results.append({
                    "code": code,
                    "price": int(prices.iloc[-1]),
                    "day1": round(float(d1), 2),
                    "day2": round(float(d2), 2),
                    "total": round(float(d1 + d2), 2),
                })
        except Exception:
            pass

    return sorted(results, key=lambda x: x["total"], reverse=True)[:10]


def call_ai(prompt):
    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )
    return resp.choices[0].message.content


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


def fmt_us(stocks):
    return "\n".join(f"{s['ticker']}: ${s['price']} ({s['change']:+.2f}%)" for s in stocks)


def fmt_kr(stocks, limit=20):
    return "\n".join(
        f"{s['code']}: {s['price']}원 ({s['change']:+.2f}%)" for s in stocks[:limit]
    )


def require_data(stocks, label):
    if not stocks:
        raise RuntimeError(f"{label} 데이터 수집 실패 — yfinance 응답 없음")


def main():
    print(f"🚀 XO 리포트 — {TODAY}")
    NOTE = "반드시 JSON만 출력. 설명·markdown 없이. 숫자는 따옴표 없이."

    us_top    = fetch_us_top_gainers()
    kr_all    = fetch_kr_stocks()
    kr_consec = fetch_kr_consecutive()

    require_data(us_top, "미국 주식")
    require_data(kr_all, "국내 주식")

    us_str = fmt_us(us_top)
    kr_str = fmt_kr(kr_all, 30)
    kr_c_str = "\n".join(
        f"{s['code']}: {s['price']}원 (1일:{s['day1']:+.2f}% 2일:{s['day2']:+.2f}% 합계:{s['total']:+.2f}%)"
        for s in kr_consec
    )

    prompts = {
        "market": (
            f"오늘({TODAY}) 나스닥 상위 200 종목 중 상승률 상위:\n{us_str}\n\n"
            f"코스피 상위 200 종목 시세:\n{kr_str}\n\n"
            f"위 미국 상승 종목들의 공통 테마를 분석하고, "
            f"그 테마와 연관된 코스피 상위 200 종목 5개를 선별해줘.\n\n"
            f"{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"market",'
            f'"theme":{{"name":"테마명","reasons":["이유1","이유2"]}},'
            f'"us_stocks":[{{"name":"회사명","ticker":"티커","price":0.0,"change":0.0}}],'
            f'"kr_stocks":[{{"name":"회사명","code":"6자리","price":0,"change":0.0}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"us_stocks 5개(상승률 순), kr_stocks 5개(테마 연관 + 코스피 상위 200 기준)."
        ),
        "technical": (
            f"오늘({TODAY}) 코스피 상위 200 종목 중 2일 연속 상승:\n{kr_c_str}\n\n"
            f"{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"technical","title":"코스피 2일 연속 상승 종목",'
            f'"market_summary":"코스피 현황 한줄",'
            f'"stocks":[{{"name":"회사명","code":"6자리","price":0,"day1":0.0,"day2":0.0,"total":0.0,"volume_ratio":0.0,"signal":"기술적 신호"}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"stocks 5개."
        ),
        "sector": (
            f"오늘({TODAY}) 나스닥 상위 200 상승 종목:\n{us_str}\n\n"
            f"코스피 상위 200 시세:\n{kr_str}\n\n"
            f"{NOTE}\n"
            f'{{"date":"{TODAY}","agent":"sector","title":"섹터별 강세 종목",'
            f'"foreign":[{{"sector":"섹터명","stocks":[{{"name":"회사명","ticker":"티커","price":0.0,"change":0.0}}]}}],'
            f'"domestic":[{{"sector":"섹터명","stocks":[{{"name":"회사명","code":"6자리","price":0,"change":0.0}}]}}],'
            f'"shorts_script":"XO입니다로 시작 60초 대본",'
            f'"blog":{{"intro":"서론","body":"본론","conclusion":"결론+면책"}}}}\n'
            f"foreign 3섹터(나스닥 상위 200 기준), domestic 3섹터(코스피 상위 200 기준)."
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
