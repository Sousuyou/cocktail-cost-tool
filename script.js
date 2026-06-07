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
const recommendedPriceRoundedEl = document.querySelector("#recommended-price-rounded");
const appMessageEl = document.querySelector("#app-message");
const recipeNameInput = document.querySelector("#recipe-name");
const saveRecipeButton = document.querySelector("#save-recipe");
const recipeListEl = document.querySelector("#recipe-list");

// localStorageのキー名（他ツールと衝突しないよう接頭辞を付けています）
const STORAGE_KEY_CURRENT = "barsoutsu_cocktailcost_current_v1";
const STORAGE_KEY_RECIPES = "barsoutsu_cocktailcost_recipes_v1";

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

// 保存・復元の連打を避けるためのデバウンス制御
let saveTimer = null;
// 復元処理中はオートセーブを止めるためのフラグ
let isRestoring = false;

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value));
}

// お知らせメッセージの表示・非表示
function showMessage(text, isError = false) {
  appMessageEl.textContent = text;
  appMessageEl.classList.toggle("is-error", Boolean(isError));
  appMessageEl.hidden = false;
}

function clearMessage() {
  appMessageEl.hidden = true;
  appMessageEl.textContent = "";
  appMessageEl.classList.remove("is-error");
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

// 1行だけのときは削除ボタンを「クリア」表示にする
function refreshRemoveButtons() {
  const rows = [...ingredientList.querySelectorAll(".ingredient-row")];
  const single = rows.length <= 1;
  ingredientList.classList.toggle("is-empty", single);
  rows.forEach((row) => {
    const button = row.querySelector(".remove-row");
    if (single) {
      button.textContent = "クリア";
      button.setAttribute("aria-label", "入力をクリア");
    } else {
      button.textContent = "削除";
      button.setAttribute("aria-label", "材料を削除");
    }
  });
}

function updateSummary() {
  const rows = [...ingredientList.querySelectorAll(".ingredient-row")];
  let total = 0;

  rows.forEach((row) => {
    const rowCost = calculateRowCost(row);
    row.querySelector(".row-cost strong").textContent = formatYen(rowCost);
    total += rowCost;

    // 使用量がボトル容量を超えていたら警告
    const bottleVolume = toNumber(row.querySelector(".volume-input").value);
    const usedVolume = toNumber(row.querySelector(".used-input").value);
    const isOver = bottleVolume > 0 && usedVolume > bottleVolume;
    row.classList.toggle("is-over", isOver);
  });

  totalCostEl.textContent = formatYen(total);

  const salePrice = toNumber(salePriceInput.value);
  const targetRate = toNumber(targetRateInput.value);

  // 原価率の表示と色分け（目標原価率を超えたら赤、以内なら緑）
  if (salePrice > 0 && total > 0) {
    const rate = (total / salePrice) * 100;
    costRateEl.textContent = `${rate.toFixed(1)}%`;
    costRateEl.classList.remove("cost-ok", "cost-over");
    if (targetRate > 0) {
      costRateEl.classList.add(rate > targetRate ? "cost-over" : "cost-ok");
    }
  } else {
    costRateEl.textContent = "-";
    costRateEl.classList.remove("cost-ok", "cost-over");
  }

  // 推奨販売価格（計算値）と100円単位で切り上げた推奨額を併記
  if (targetRate > 0 && total > 0) {
    const recommended = total / (targetRate / 100);
    recommendedPriceEl.textContent = formatYen(recommended);
    const rounded = Math.ceil(recommended / 100) * 100;
    recommendedPriceRoundedEl.textContent = `100円丸め: ${formatYen(rounded)}`;
  } else {
    recommendedPriceEl.textContent = "-";
    recommendedPriceRoundedEl.textContent = "-";
  }

  refreshRemoveButtons();

  // 入力が変わるたびに現在の状態を自動保存
  scheduleSaveCurrent();
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

// ============================================================
// 自動保存・復元（現在の入力状態）
// ============================================================

// 現在の入力状態をひとまとめのオブジェクトにする
function getCurrentState() {
  return {
    salePrice: salePriceInput.value,
    targetRate: targetRateInput.value,
    rows: collectRows().map((row) => ({
      name: row.name,
      bottlePrice: row.bottlePrice,
      bottleVolume: row.bottleVolume,
      usedVolume: row.usedVolume,
    })),
  };
}

// 保存された状態オブジェクトを画面に反映する
function applyState(state) {
  if (!state || typeof state !== "object") {
    return;
  }
  isRestoring = true;
  try {
    salePriceInput.value = state.salePrice ?? "";
    targetRateInput.value = state.targetRate ?? "";

    ingredientList.innerHTML = "";
    const rows = Array.isArray(state.rows) ? state.rows : [];
    if (rows.length === 0) {
      addIngredientRow();
    } else {
      rows.forEach((data) => addIngredientRow(data));
    }
  } finally {
    isRestoring = false;
  }
  updateSummary();
}

// 現在の状態をlocalStorageへ保存（連打防止のため少し待ってから書き込み）
function scheduleSaveCurrent() {
  if (isRestoring) {
    return;
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(getCurrentState()));
    } catch (error) {
      // プライベートモードやfile://など保存できない環境では何もしません。
    }
  }, 300);
}

// 起動時に現在の状態を復元（なければ既定の2行を表示）
function restoreCurrent() {
  let state = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (error) {
    state = null;
  }

  if (state && Array.isArray(state.rows) && state.rows.length > 0) {
    applyState(state);
    return;
  }

  // 保存データがない初回は、これまで通りのサンプルを表示します。
  addIngredientRow({ name: "ドライジン", bottlePrice: 5000, bottleVolume: 700, usedVolume: 30 });
  addIngredientRow({ name: "トニックウォーター", bottlePrice: 115, bottleVolume: 250, usedVolume: 120 });
}

// ============================================================
// 名前を付けて複数レシピ保存・呼び出し・削除
// ============================================================

// 保存済みレシピ一覧を取得（壊れていたら空配列）
function loadRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECIPES);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

// レシピ一覧を保存
function persistRecipes(recipes) {
  try {
    localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(recipes));
    return true;
  } catch (error) {
    return false;
  }
}

// 保存済みレシピ一覧を画面に描画
function renderRecipeList() {
  const recipes = loadRecipes();
  recipeListEl.innerHTML = "";

  if (recipes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "recipe-empty";
    empty.textContent = "保存したレシピはまだありません。";
    recipeListEl.append(empty);
    return;
  }

  recipes.forEach((recipe, index) => {
    const item = document.createElement("div");
    item.className = "recipe-item";

    const name = document.createElement("span");
    name.className = "recipe-item-name";
    name.textContent = recipe.name;

    const actions = document.createElement("div");
    actions.className = "recipe-item-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "呼び出し";
    loadBtn.addEventListener("click", () => {
      applyState(recipe.state);
      recipeNameInput.value = recipe.name;
      showMessage(`「${recipe.name}」を呼び出しました。`);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "recipe-delete";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      if (!window.confirm(`「${recipe.name}」を削除します。よろしいですか？`)) {
        return;
      }
      const current = loadRecipes();
      current.splice(index, 1);
      persistRecipes(current);
      renderRecipeList();
      showMessage(`「${recipe.name}」を削除しました。`);
    });

    actions.append(loadBtn, deleteBtn);
    item.append(name, actions);
    recipeListEl.append(item);
  });
}

// 名前を付けて現在のレシピを保存（同名は上書き）
function saveRecipe() {
  const name = recipeNameInput.value.trim();
  if (!name) {
    showMessage("レシピ名を入力してください。", true);
    recipeNameInput.focus();
    return;
  }

  const recipes = loadRecipes();
  const newRecipe = { name, state: getCurrentState(), savedAt: Date.now() };
  const existingIndex = recipes.findIndex((recipe) => recipe.name === name);

  if (existingIndex >= 0) {
    if (!window.confirm(`「${name}」はすでに保存されています。上書きしますか？`)) {
      return;
    }
    recipes[existingIndex] = newRecipe;
  } else {
    recipes.push(newRecipe);
  }

  if (persistRecipes(recipes)) {
    renderRecipeList();
    showMessage(`「${name}」を保存しました。`);
  } else {
    showMessage("保存できませんでした。お使いの環境では保存機能が利用できない可能性があります。", true);
  }
}

// ============================================================
// CSV 保存・読み込み
// ============================================================

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

// 読み込んだCSVが期待した形式かを確認する。問題があれば理由を返す。
function validateCsv(rows) {
  if (rows.length === 0) {
    return "CSVが空です。読み込みを中止しました。";
  }

  const header = rows[0].map((cell) => String(cell).trim());
  // 1列目のヘッダーが「材料名」であることを最低条件にします。
  if (header[0] !== "材料名") {
    return "このツールで保存したCSVではないようです。読み込みを中止しました。";
  }
  if (header.length < 4) {
    return "CSVの列が不足しています。読み込みを中止しました。";
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return "材料データが見つかりません。読み込みを中止しました。";
  }

  // 数値であるべき列に数値以外が入っていないかを確認します（空欄は許容）。
  for (let i = 0; i < dataRows.length; i += 1) {
    const cells = dataRows[i];
    const numericIndexes = [1, 2, 3]; // ボトル価格・容量ml・使用量ml
    for (const col of numericIndexes) {
      const value = String(cells[col] ?? "").trim();
      if (value !== "" && !Number.isFinite(Number.parseFloat(value))) {
        return `${i + 2}行目に数値でない値があります。読み込みを中止しました。`;
      }
    }
  }

  return null; // 問題なし
}

function loadCsv(file) {
  const reader = new FileReader();

  reader.addEventListener("error", () => {
    showMessage("ファイルを読み込めませんでした。", true);
  });

  reader.addEventListener("load", () => {
    let rows;
    try {
      rows = parseCsv(String(reader.result ?? "").replace(/^\uFEFF/, ""));
    } catch (error) {
      showMessage("CSVを解析できませんでした。読み込みを中止しました。", true);
      return;
    }

    // 不正な形式なら、既存の入力を上書きせずに中止します。
    const errorReason = validateCsv(rows);
    if (errorReason) {
      showMessage(errorReason, true);
      return;
    }

    const dataRows = rows.slice(1);

    ingredientList.innerHTML = "";
    salePriceInput.value = dataRows[0]?.[5] ?? "";
    targetRateInput.value = dataRows[0]?.[6] ?? "";

    dataRows.forEach((cells) => {
      addIngredientRow({
        name: cells[0] ?? "",
        bottlePrice: cells[1] ?? "",
        bottleVolume: cells[2] ?? "",
        usedVolume: cells[3] ?? "",
      });
    });

    updateSummary();
    showMessage("CSVを読み込みました。");
  });

  reader.readAsText(file);
}

// ============================================================
// イベント登録・初期化
// ============================================================

addRowButton.addEventListener("click", () => addIngredientRow());
downloadCsvButton.addEventListener("click", downloadCsv);
salePriceInput.addEventListener("input", updateSummary);
targetRateInput.addEventListener("input", updateSummary);
saveRecipeButton.addEventListener("click", saveRecipe);
csvFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadCsv(file);
  }
  event.target.value = "";
});

// 起動時：保存済みの入力状態を復元し、レシピ一覧を描画します。
restoreCurrent();
renderRecipeList();

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // ローカルファイルで開いた場合など、登録できない環境では通常のWebページとして動かします。
    });
  });
}
