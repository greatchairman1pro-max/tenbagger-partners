var SHEET_ID = '1khU2HGxoy1qb5rrIqhkj68tESSb79IdF4fWIBmkxUJg';

function jsonRes(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET: 데이터 조회 / 상태 업데이트 ──
function doGet(e) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  var action = e.parameter.action || 'getData';

  if (action === 'getData') {
    var values = sheet.getDataRange().getValues();
    var result = { status: 'ok', data: [] };
    if (values.length > 1) {
      var headers = values[0];
      var rows = [];
      for (var i = 1; i < values.length; i++) {
        var row = { _row: i + 1 };
        for (var j = 0; j < headers.length; j++) {
          row[headers[j]] = values[i][j];
        }
        rows.push(row);
      }
      result.data = rows;
    }
    var cb = e.parameter.callback;
    if (cb) {
      return ContentService
        .createTextOutput(cb + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonRes(result);
  }

  if (action === 'updateStatus') {
    var rowIndex = parseInt(e.parameter.row);
    var col = parseInt(e.parameter.col);
    var value = e.parameter.value;
    sheet.getRange(rowIndex, col).setValue(value);
    return jsonRes({ status: 'ok' });
  }

  return jsonRes({ status: 'error', message: 'unknown action' });
}

// ── POST: 신규 제출 ──
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    var d = JSON.parse(e.parameter.data);

    var existingRow = -1;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === d.bizName) { existingRow = i + 1; break; }
    }

    var version = 'v1';
    if (existingRow > 0) {
      var prev = data[existingRow - 1][25] || 'v1';
      version = 'v' + (parseInt(prev.replace('v', '')) + 1);
    }

    // 이전 행 데이터와 병합 (빈 값은 이전 값 유지)
    var prev = existingRow > 0 ? data[existingRow - 1] : null;
    function merge(newVal, colIdx) {
      var n = (newVal !== undefined && newVal !== null) ? String(newVal).trim() : '';
      if (n !== '' && n !== '0') return newVal;
      return prev ? prev[colIdx] : '';
    }

    var row = [
      d.timestamp,
      d.bizName,
      merge(d.industry,   2), merge(d.bizAge,  3), merge(d.address, 4),
      merge(d.revenue,    5), merge(d.payments, 6), merge(d.dailyCustomer, 7),
      merge(d.rent,       8), merge(d.utility,  9), merge(d.telecom, 10),
      merge(d.costRate,  11),
      merge(d.employees, 12), merge(d.labor,   13), merge(d.ownerWork, 14),
      merge(d.rentals,   15), merge(d.platforms,16), merge(d.marketing,17),
      merge(d.customerType,18), merge(d.concerns,19), merge(d.freeText,20),
      merge(d.goal,      21),
      d.score > 0 ? d.score : (prev ? prev[22] : 0),
      d.missingItems || (prev ? prev[23] : ''),
      d.portfolioStatus, version,
      prev ? prev[26] : '미완료',
      prev ? prev[27] : '미완료',
      prev ? prev[28] : ''
    ];

    sheet.appendRow(row);

    var lastRow = sheet.getLastRow();
    var scoreCell = sheet.getRange(lastRow, 23);
    if (d.score >= 75) scoreCell.setBackground('#D4F0E4');
    else if (d.score >= 45) scoreCell.setBackground('#E6F1FB');
    else scoreCell.setBackground('#FDECD0');

    return jsonRes({ status: 'success', version: version });
  } catch (err) {
    return jsonRes({ status: 'error', message: err.toString() });
  }
}
