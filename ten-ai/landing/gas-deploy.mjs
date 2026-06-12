/**
 * gas-deploy.mjs
 * 텐베거 파트너스 — GAS 통합 데이터 API 자동 배포 v2
 * 실행: node gas-deploy.mjs
 */
import { createServer } from 'http';
import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const CLIENT_ID     = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';
const REDIRECT_PORT = 3131;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`;
const SCOPE = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

const SHEET_ID = '1khU2HGxoy1qb5rrIqhkj68tESSb79IdF4fWIBmkxUJg';
const __dir    = dirname(fileURLToPath(import.meta.url));

// ── GAS manifest ──────────────────────────────────────
const MANIFEST = JSON.stringify({
  timeZone: 'Asia/Seoul',
  dependencies: {},
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
  oauthScopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request'
  ]
});

// ── GAS main code ─────────────────────────────────────
const GAS_CODE = `
var SHEET_ID = '${SHEET_ID}';

/* ═══════════════════════════════════════════════════════
   doGet  — GET 요청 라우터
   사용처: detail.html (saveFinancials), admin.html (deleteRow, updateStatus)
═══════════════════════════════════════════════════════ */
function doGet(e) {
  var p = e.parameter || {};
  var out;

  if      (p.action === 'saveIntake')     out = saveIntake(p);
  else if (p.action === 'getIntake')      out = getIntake(p);
  else if (p.action === 'saveFinancials') out = saveFinancials(p);
  else if (p.action === 'getFinancials')  out = getFinancials(p);
  else if (p.action === 'deleteRow')      out = deleteRow(p);
  else if (p.action === 'updateStatus')   out = updateStatus(p);
  else if (p.action === 'saveClient')     out = saveClient(p);
  else if (p.action === 'getClient')      out = getClient(p);
  else out = { ok: true, msg: '텐베거 파트너스 데이터 API v2', sheet: SHEET_ID };

  var cb   = p.callback || p.cb || null;
  var body = cb ? cb + '(' + JSON.stringify(out) + ')' : JSON.stringify(out);
  var mime = cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}

/* ═══════════════════════════════════════════════════════
   doPost — POST 요청 라우터
   사용처: index.html (상담 신청 폼)
═══════════════════════════════════════════════════════ */
function doPost(e) {
  try {
    /* Form POST: data=<JSON string> */
    var dataStr = '';
    if (e.parameter && e.parameter.data) {
      dataStr = e.parameter.data;
    } else if (e.postData && e.postData.parameters && e.postData.parameters.data) {
      dataStr = e.postData.parameters.data;
    } else if (e.postData && e.postData.contents) {
      var m = e.postData.contents.match(/(?:^|&)data=([^&]*)/);
      if (m) dataStr = decodeURIComponent(m[1].replace(/\\+/g, ' '));
    }
    var data   = dataStr ? JSON.parse(dataStr) : {};
    var result = saveIntake(data);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ═══════════════════════════════════════════════════════
   saveIntake — 상담 신청 데이터 저장 (index.html → Sheet 1)

   컬럼 구조 (1-based):
   1  접수일시    2  상호명       3  업종         4  영업기간
   5  주소        6  월매출(만원) 7  결제수단     8  일일고객
   9  임대료(만원) 10 공과금(만원) 11 통신비      12 원가율
   13 직원수      14 인건비(만원) 15 오너참여    16 렌탈현황
   17 플랫폼      18 마케팅비     19 고객유형    20 주요고민
   21 자유메모    22 목표비전     23 사업단계    24 자산관리
   25 fcInternet  26 fcTV        27 fcPOS        28 fcCCTV
   29 fcAppliance 30 fcWater     31 fcInsurance  32 fcAds
   33 완성도점수  34 미수집항목   35 포트폴리오상태
   36 킵분석      37 탑검토       38 포트폴리오URL
═══════════════════════════════════════════════════════ */
function saveIntake(data) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheets()[0];

    var HEADERS = [
      '접수일시','상호명','업종','영업기간','주소',
      '월매출(만원)','결제수단','일일고객',
      '임대료(만원)','공과금(만원)','통신비','원가율',
      '직원수','인건비(만원)','오너참여','렌탈현황',
      '플랫폼','마케팅비','고객유형','주요고민',
      '자유메모','목표비전','사업단계','자산관리',
      'fcInternet','fcTV','fcPOS','fcCCTV',
      'fcAppliance','fcWater','fcInsurance','fcAds',
      '완성도점수','미수집항목','포트폴리오상태',
      '킵분석','탑검토','포트폴리오URL'
    ];

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sh.setFrozenRows(1);
    }

    var row = [
      data.timestamp   || new Date().toISOString(),
      data.bizName     || '',
      data.industry    || '',
      data.bizAge      || '',
      data.address     || '',
      parseFloat(data.revenue)      || 0,
      data.payments    || '',
      parseFloat(data.dailyCustomer)|| 0,
      parseFloat(data.rent)         || 0,
      parseFloat(data.utility)      || 0,
      data.telecom     || '',
      parseFloat(data.costRate)     || 0,
      parseFloat(data.employees)    || 0,
      parseFloat(data.labor)        || 0,
      data.ownerWork   || '',
      data.rentals     || '',
      data.platforms   || '',
      parseFloat(data.marketing)    || 0,
      data.customerType|| '',
      data.concerns    || '',
      data.freeText    || '',
      data.goal        || '',
      data.bizStage    || '',
      data.assetInterest|| '',
      parseFloat(data.fcInternet)   || 0,
      parseFloat(data.fcTV)         || 0,
      parseFloat(data.fcPOS)        || 0,
      parseFloat(data.fcCCTV)       || 0,
      parseFloat(data.fcAppliance)  || 0,
      parseFloat(data.fcWater)      || 0,
      parseFloat(data.fcInsurance)  || 0,
      parseFloat(data.fcAds)        || 0,
      parseFloat(data.score)        || 0,
      data.missingItems|| '',
      data.portfolioStatus || '',
      '', '', ''  // 킵분석, 탑검토, 포트폴리오URL — admin이 채움
    ];

    /* 동일 상호명 → 업데이트, 신규 → 추가 */
    var vals = sh.getDataRange().getValues();
    var found = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][1]) === String(row[1]) && row[1] !== '') {
        found = i + 1; break;
      }
    }
    if (found > 0) sh.getRange(found, 1, 1, row.length).setValues([row]);
    else           sh.appendRow(row);

    return { success: true, biz: data.bizName };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   getIntake — 상담데이터 전체 조회 (admin.html)
   action=getIntake&callback=handleAdminData
═══════════════════════════════════════════════════════ */
function getIntake(p) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheets()[0];
    if (sh.getLastRow() < 2) return { success: true, rows: [] };
    var vals = sh.getDataRange().getValues();
    var headers = vals[0].map(String);
    var rows = [];
    for (var i = 1; i < vals.length; i++) {
      var obj = { _row: i + 1 };
      for (var j = 0; j < headers.length; j++) {
        var v = vals[i][j];
        obj[headers[j]] = (v === null || v === undefined) ? '' : String(v);
      }
      rows.push(obj);
    }
    return { success: true, rows: rows };
  } catch(err) {
    return { success: false, error: err.toString(), rows: [] };
  }
}

/* ═══════════════════════════════════════════════════════
   saveFinancials — 월별 재무데이터 저장 (detail.html → '재무데이터' 시트)

   컬럼 구조:
   1 저장일시  2 상호명  3 연도  4 총투자금  5 인테리어비용
   월별 8컬럼 × 12 (6~101):
     m월매출, m월원가율, m월임대료, m월인건비,
     m월공과금, m월마케팅, m월기타, m월기타세부
═══════════════════════════════════════════════════════ */
function saveFinancials(p) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName('재무데이터');
    if (!sh) {
      sh = ss.insertSheet('재무데이터');
      var h = ['저장일시','상호명','연도','총투자금','인테리어비용'];
      for (var mi = 1; mi <= 12; mi++) {
        [mi+'월매출', mi+'월원가율', mi+'월임대료', mi+'월인건비',
         mi+'월공과금', mi+'월마케팅', mi+'월기타', mi+'월기타세부']
          .forEach(function(f) { h.push(f); });
      }
      sh.getRange(1, 1, 1, h.length).setValues([h]);
      sh.setFrozenRows(1);
    }

    var biz = p.bizName || '', yr = p.year || '';
    var row = [
      new Date(), biz, yr,
      parseFloat(p.invest)   || 0,
      parseFloat(p.interior) || 0
    ];
    for (var mi = 1; mi <= 12; mi++) {
      row.push(parseFloat(p['m'+mi+'_rev'])   || 0);
      row.push(parseFloat(p['m'+mi+'_cRate']) || 0);
      row.push(parseFloat(p['m'+mi+'_rent'])  || 0);
      row.push(parseFloat(p['m'+mi+'_labor']) || 0);
      row.push(parseFloat(p['m'+mi+'_util'])  || 0);
      row.push(parseFloat(p['m'+mi+'_mkt'])   || 0);
      row.push(parseFloat(p['m'+mi+'_other']) || 0);
      row.push(p['m'+mi+'_otherDetail']       || '');
    }

    var vals  = sh.getDataRange().getValues();
    var found = -1;
    for (var ri = 1; ri < vals.length; ri++) {
      if (vals[ri][1] === biz && String(vals[ri][2]) === String(yr)) {
        found = ri + 1; break;
      }
    }
    if (found > 0) sh.getRange(found, 1, 1, row.length).setValues([row]);
    else           sh.appendRow(row);

    return { success: true, biz: biz, year: yr };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   getFinancials — 재무데이터 조회 (브리핑은 gviz 직접 사용,
   이 함수는 외부 호출용 백업)
═══════════════════════════════════════════════════════ */
function getFinancials(p) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName('재무데이터');
    if (!sh) return { success: false, error: '재무데이터 시트 없음' };

    var vals = sh.getDataRange().getValues();
    for (var ri = 1; ri < vals.length; ri++) {
      if (vals[ri][1] === p.biz && String(vals[ri][2]) === String(p.year)) {
        var months = [];
        for (var mi = 1; mi <= 12; mi++) {
          var base = 5 + (mi - 1) * 8; /* 0-based */
          months.push({
            m:           mi,
            rev:         vals[ri][base]     || 0,
            cRate:       vals[ri][base + 1] || 30,
            rent:        vals[ri][base + 2] || 0,
            labor:       vals[ri][base + 3] || 0,
            util:        vals[ri][base + 4] || 0,
            mkt:         vals[ri][base + 5] || 0,
            other:       vals[ri][base + 6] || 0,
            otherDetail: vals[ri][base + 7] || ''
          });
        }
        return {
          success: true, biz: p.biz, year: p.year,
          invest:   vals[ri][3] || 0,
          interior: vals[ri][4] || 0,
          months:   months
        };
      }
    }
    return { success: false, error: '데이터 없음' };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   deleteRow — 상담데이터 행 삭제 (admin.html)
   파라미터: row (1-based 행 번호, 헤더 행 제외 최소 2)
═══════════════════════════════════════════════════════ */
function deleteRow(p) {
  try {
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var sh     = ss.getSheets()[0];
    var rowNum = parseInt(p.row);
    if (isNaN(rowNum) || rowNum < 2) return { success: false, error: '잘못된 행 번호: ' + p.row };
    sh.deleteRow(rowNum);
    return { success: true, deleted: rowNum };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   updateStatus — 특정 셀 값 변경 (admin.html)
   파라미터: row, col (1-based), value
   사용처: 킵분析(36), 탑검토(37), 포트폴리오URL(38) 컬럼
═══════════════════════════════════════════════════════ */
function updateStatus(p) {
  try {
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var sh     = ss.getSheets()[0];
    var rowNum = parseInt(p.row);
    var colNum = parseInt(p.col);
    var value  = p.value || '';
    if (isNaN(rowNum) || rowNum < 2 || isNaN(colNum) || colNum < 1) {
      return { success: false, error: '잘못된 파라미터' };
    }
    sh.getRange(rowNum, colNum).setValue(value);
    return { success: true, row: rowNum, col: colNum, value: value };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   saveClient — 고객정보 저장 (briefing.html → '고객정보' 시트)
   컬럼: 저장일시, 상호명, 사업자등록번호, 대표자명, 전화번호, 주소, 동의여부
═══════════════════════════════════════════════════════ */
function saveClient(p) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName('고객정보');
    if (!sh) {
      sh = ss.insertSheet('고객정보');
      sh.getRange(1, 1, 1, 7).setValues([['저장일시','상호명','사업자등록번호','대표자명','전화번호','주소','동의여부']]);
      sh.setFrozenRows(1);
    }
    var biz = p.biz || '';
    var row = [
      new Date(),
      biz,
      p.brn      || '',
      p.ceoName  || '',
      p.tel      || '',
      p.addr     || '',
      p.consent  || 'N'
    ];
    /* 동일 사업자등록번호 → 업데이트, 신규 → 추가 */
    var vals = sh.getDataRange().getValues();
    var found = -1;
    for (var i = 1; i < vals.length; i++) {
      if (p.brn && String(vals[i][2]) === String(p.brn)) { found = i + 1; break; }
    }
    if (found > 0) sh.getRange(found, 1, 1, row.length).setValues([row]);
    else           sh.appendRow(row);
    return { success: true, biz: biz };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}

/* ═══════════════════════════════════════════════════════
   getClient — 고객정보 조회 (briefing.html)
   파라미터: brn (사업자등록번호) 또는 biz (상호명)
═══════════════════════════════════════════════════════ */
function getClient(p) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName('고객정보');
    if (!sh) return { success: false, error: '고객정보 시트 없음' };
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var match = (p.brn && String(vals[i][2]) === String(p.brn))
               || (p.biz && String(vals[i][1]) === String(p.biz));
      if (match) {
        return { success: true, data: {
          biz:     vals[i][1], brn:     vals[i][2],
          ceoName: vals[i][3], tel:     vals[i][4],
          addr:    vals[i][5], consent: vals[i][6]
        }};
      }
    }
    return { success: false, error: '데이터 없음' };
  } catch(err) {
    return { success: false, error: err.toString() };
  }
}
`;

// ── OAuth helpers ─────────────────────────────────────
async function getAccessToken() {
  const state         = crypto.randomBytes(16).toString('hex');
  const codeVerifier  = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?'
    + `client_id=${CLIENT_ID}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&response_type=code`
    + `&scope=${encodeURIComponent(SCOPE)}`
    + `&state=${state}`
    + `&code_challenge=${codeChallenge}`
    + `&code_challenge_method=S256`
    + `&access_type=offline`
    + `&prompt=consent`;

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url   = new URL(req.url, REDIRECT_URI);
        const code  = url.searchParams.get('code');
        const retSt = url.searchParams.get('state');

        if (!code || retSt !== state) {
          res.writeHead(400, {'Content-Type': 'text/html;charset=utf-8'});
          res.end('<h2>오류 — 다시 시도해 주세요</h2>');
          return;
        }

        res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0f6ff">
          <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
          <div style="font-size:56px;margin-bottom:16px">✅</div>
          <h2 style="color:#185FA5;margin-bottom:8px">인증 완료!</h2>
          <p style="color:#666">이 탭을 닫아도 됩니다.<br>GAS 배포가 자동으로 진행됩니다.</p>
          </div></body></html>`);
        server.close();

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: new URLSearchParams({
            code,
            client_id:     CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri:  REDIRECT_URI,
            grant_type:    'authorization_code',
            code_verifier: codeVerifier
          })
        });
        const tok = await tokenRes.json();
        if (tok.access_token) resolve(tok.access_token);
        else reject(new Error('토큰 교환 실패: ' + JSON.stringify(tok)));
      } catch(err) {
        reject(err);
      }
    });

    server.on('error', reject);
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      console.log('\n🌐 브라우저가 열립니다 — Google 계정으로 로그인하고 "허용"을 클릭하세요\n');
      exec(`cmd.exe /c start "" "${authUrl}"`, err => {
        if (err) {
          console.log('브라우저 자동 오픈 실패. 아래 URL을 직접 여세요:');
          console.log(authUrl);
        }
      });
    });
  });
}

// ── Apps Script API helpers ───────────────────────────
async function gasApi(token, method, path, body) {
  const res = await fetch(`https://script.googleapis.com/v1/${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (data.error) throw new Error(`GAS API 오류 (${path}): ${JSON.stringify(data.error)}`);
  return data;
}

// ── HTML 파일의 GAS URL을 일괄 교체 ──────────────────
// 지원 패턴: var/let/const GAS_URL or SHEET_URL = '...'
function updateHtmlUrl(filePath, newUrl) {
  try {
    let content = readFileSync(filePath, 'utf-8');
    const before = content;
    content = content.replace(
      /((?:var|let|const)\s+(?:GAS_URL|SHEET_URL)\s*=\s*')[^']+(')/g,
      `$1${newUrl}$2`
    );
    if (content === before) return false;
    writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch(e) {
    return false;
  }
}

// ── MAIN ──────────────────────────────────────────────
async function main() {
  console.log('━'.repeat(58));
  console.log('  텐베거 파트너스 — GAS 통합 데이터 API 자동 배포 v2');
  console.log('━'.repeat(58));

  // 1. OAuth
  console.log('\n[1/4] Google 계정 인증...');
  const token = await getAccessToken();
  console.log('      ✅ 인증 완료\n');

  // 2. Create project
  console.log('[2/4] GAS 프로젝트 생성 중...');
  const project  = await gasApi(token, 'POST', 'projects', {
    title: '텐베거파트너스-통합API-v2'
  });
  const scriptId = project.scriptId;
  console.log(`      ✅ 프로젝트 ID: ${scriptId}\n`);

  // 3. Upload code
  console.log('[3/4] 코드 업로드 중...');
  await gasApi(token, 'PUT', `projects/${scriptId}/content`, {
    files: [
      { name: 'appsscript', type: 'JSON',     source: MANIFEST },
      { name: 'Code',       type: 'SERVER_JS', source: GAS_CODE }
    ]
  });
  console.log('      ✅ 코드 업로드 완료\n');

  // 4. Version + deployment
  console.log('[4/4] 웹앱으로 배포 중...');
  const version = await gasApi(token, 'POST', `projects/${scriptId}/versions`, {
    description: 'v2 - 통합 데이터 API (intake + financials + admin)'
  });
  const deployment = await gasApi(token, 'POST', `projects/${scriptId}/deployments`, {
    versionNumber:    version.versionNumber,
    manifestFileName: 'appsscript',
    description:      '텐베거 통합 API v2'
  });

  const deployId  = deployment.deploymentId;
  const newGasUrl = `https://script.google.com/macros/s/${deployId}/exec`;
  console.log('      ✅ 배포 완료!\n');

  // 5. Patch all HTML files
  const FILES = [
    { name: 'detail.html',   path: join(__dir, 'detail.html') },
    { name: 'briefing.html', path: join(__dir, 'briefing.html') },
    { name: 'admin.html',    path: join(__dir, 'admin.html') },
    { name: 'index.html',    path: join(__dir, 'index.html') }
  ];

  console.log('━'.repeat(58));
  console.log('\n🎉 완료!\n');
  console.log(`  새 GAS URL:\n  ${newGasUrl}\n`);

  FILES.forEach(f => {
    const ok = updateHtmlUrl(f.path, newGasUrl);
    console.log(`  ${f.name.padEnd(14)} URL 교체: ${ok ? '✅' : '⚠️  수동 교체 필요'}`);
  });

  console.log('\n  ⚠️  첫 실행 시 GAS에서 권한 허용이 필요할 수 있습니다.');
  console.log('     detail.html 에서 저장 버튼을 누르면 권한 요청 화면이 나타납니다.');
  console.log('     "고급" → "텐베거파트너스-통합API-v2(으)로 이동" → "허용"\n');
  console.log('━'.repeat(58));
}

main().catch(err => {
  console.error('\n❌ 오류:', err.message);
  process.exit(1);
});
