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

    var row = [
      d.timestamp, d.bizName, d.industry, d.bizAge, d.address,
      d.revenue, d.payments, d.dailyCustomer,
      d.rent, d.utility, d.telecom, d.costRate,
      d.employees, d.labor, d.ownerWork, d.rentals,
      d.platforms, d.marketing, d.customerType,
      d.concerns, d.freeText, d.goal,
      d.score, d.missingItems, d.portfolioStatus, version,
      '미완료', '미완료', ''
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
