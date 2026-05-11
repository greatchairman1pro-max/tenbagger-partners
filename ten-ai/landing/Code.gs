var SHEET_ID = '1khU2HGxoy1qb5rrIqhkj68tESSb79IdF4fWIBmkxUJg';
var SHEET_NAME = '상담데이터';

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    var d = JSON.parse(e.postData.contents);

    var existingRow = -1;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === d.bizName) {
        existingRow = i + 1;
        break;
      }
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
      d.score, d.missingItems, d.portfolioStatus, version
    ];

    sheet.appendRow(row);

    var lastRow = sheet.getLastRow();
    var scoreCell = sheet.getRange(lastRow, 23);
    if (d.score >= 75) {
      scoreCell.setBackground('#D4F0E4');
    } else if (d.score >= 45) {
      scoreCell.setBackground('#E6F1FB');
    } else {
      scoreCell.setBackground('#FDECD0');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', version: version }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
