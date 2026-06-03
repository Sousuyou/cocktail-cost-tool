const ingredientList = document.querySelector("#ingredient-list");
const rowTemplate = document.querySelector("#ingredient-row-template");
const addRowButton = document.querySelector("#add-row");
const downloadCsvButton = document.querySelector("#download-csv");
const csvFileInput = document.querySelector("#csv-file");
const salePriceInput = document.querySelector("#sale-price");
const targetRateInput = document.querySelector("#target-rate");
const totalCostEl = document.querySelector("#total-cost");
const costRateEl = document.querySelector("#cost-rate");
const recommendedPriceEl = document.querySelector("#recommended-price");

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value));
}

function calculateRowCost(row) {
  const bottlePrice = toNumber(row.querySelector(".price-input").value);
  const bottleVolume = toNumber(row.querySelector(".volume-input").value);
  const usedVolume = toNumber(row.querySelector(".used-input").value);

  if (bottlePrice <= 0 || bottleVolume <= 0 || usedVolume <= 0) {
    return 0;
  }

  return (bottlePrice / bottleVolume) * usedVolume;
}

function updateSummary() {
  const rows = [...ingredientList.querySelectorAll(".ingredient-row")];
  let total = 0;

  rows.forEach((row) => {
    const rowCost = calculateRowCost(row);
    row.querySelector(".row-cost strong").textContent = formatYen(rowCost);
    total += rowCost;
  });

  totalCostEl.textContent = formatYen(total);

  const salePrice = toNumber(salePriceInput.value);
  costRateEl.textContent = salePrice > 0 && total > 0 ? `${((total / salePrice) * 100).toFixed(1)}%` : "-";

  const targetRate = toNumber(targetRateInput.value);
  recommendedPriceEl.textContent = targetRate > 0 && total > 0 ? formatYen(total / (targetRate / 100)) : "-";

  ingredientList.classList.toggle("is-empty", rows.length <= 1);
}

function addIngredientRow(data = {}) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".name-input").value = data.name ?? "";
  row.querySelector(".price-input").value = data.bottlePrice ?? "";
  row.querySelector(".volume-input").value = data.bottleVolume ?? "";
  row.querySelector(".used-input").value = data.usedVolume ?? "";

  row.addEventListener("input", updateSummary);
  row.querySelector(".remove-row").addEventListener("click", () => {
    if (ingredientList.querySelectorAll(".ingredient-row").length === 1) {
      row.querySelectorAll("input").forEach((input) => {
        input.value = "";
      });
    } else {
      row.remove();
    }
    updateSummary();
  });

  ingredientList.append(row);
  updateSummary();
}

function collectRows() {
  return [...ingredientList.querySelectorAll(".ingredient-row")].map((row) => ({
    name: row.querySelector(".name-input").value.trim(),
    bottlePrice: row.querySelector(".price-input").value,
    bottleVolume: row.querySelector(".volume-input").value,
    usedVolume: row.querySelector(".used-input").value,
    rowCost: calculateRowCost(row),
  }));
}

function escapeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv() {
  const header = ["材料名", "ボトル価格", "容量ml", "使用量ml", "1杯あたり原価", "販売価格", "目標原価率"];
  const rows = collectRows().map((row, index) => [
    row.name,
    row.bottlePrice,
    row.bottleVolume,
    row.usedVolume,
    row.rowCost.toFixed(2),
    index === 0 ? salePriceInput.value : "",
    index === 0 ? targetRateInput.value : "",
  ]);

  return [header, ...rows].map((line) => line.map(escapeCsvCell).join(",")).join("\n");
}

function downloadCsv() {
  const csv = buildCsv();
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `cocktail-cost-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function loadCsv(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const rows = parseCsv(String(reader.result ?? "").replace(/^\uFEFF/, ""));
    const dataRows = rows.slice(1);

    ingredientList.innerHTML = "";
    salePriceInput.value = dataRows[0]?.[5] ?? "";
    targetRateInput.value = dataRows[0]?.[6] ?? "";

    if (dataRows.length === 0) {
      addIngredientRow();
      return;
    }

    dataRows.forEach((cells) => {
      addIngredientRow({
        name: cells[0] ?? "",
        bottlePrice: cells[1] ?? "",
        bottleVolume: cells[2] ?? "",
        usedVolume: cells[3] ?? "",
      });
    });

    updateSummary();
  });

  reader.readAsText(file);
}

addRowButton.addEventListener("click", () => addIngredientRow());
downloadCsvButton.addEventListener("click", downloadCsv);
salePriceInput.addEventListener("input", updateSummary);
targetRateInput.addEventListener("input", updateSummary);
csvFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadCsv(file);
  }
  event.target.value = "";
});

addIngredientRow({ name: "ドライジン", bottlePrice: 5000, bottleVolume: 500, usedVolume: 45 });
addIngredientRow({ name: "トニックウォーター", bottlePrice: 180, bottleVolume: 200, usedVolume: 120 });

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // ローカルファイルで開いた場合など、登録できない環境では通常のWebページとして動かします。
    });
  });
}
