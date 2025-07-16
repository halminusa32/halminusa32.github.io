const envKey = 'lit_original_web_mdWOQLJog08jy6iR';
const dataTables = [

]

const storage = window.localStorage;

const keys = {
  "検索機能": 'breadList',
  "コメント機能": 'comments',
  "診断機能": 'checkList',
  "予約機能": 'reservations',
};

function getData(key) {
  const storageKey = `${envKey}_${keys[key]}`;
  const item = storage.getItem(storageKey);
  const parsed = item ? JSON.parse(item) : [];
  return parsed;
}

function setData(key, data) {
  const storageKey = `${envKey}_${keys[key]}`;
  storage.setItem(storageKey, JSON.stringify(data));
}

function getBreadList() {
  return getData('検索機能');
}

function getComments() {
  return getData('コメント機能');
}

function postComment(comment) {
  const comments = getComments();
  comments.push({ ...comment, id: Date.now() });
  setData('コメント機能', comments);
}

function patchComment(index, value) {
  const comments = getComments();
  if (comments[index]) {
    comments[index] = { ...comments[index], ...value };
    setData('コメント機能', comments);
  } else {
    console.warn(`指定された index（${index}）に該当するコメントが見つかりません`);
  }
}

function getCheckList() {
  return getData('診断機能');
}

function getReservations() {
  return getData('予約機能');
}

function postReservation(reservation) {
  const reservations = getReservations();
  reservations.push({ ...reservation, id: Date.now() });
  setData('予約機能', reservations);
}

function patchReservation(index, value) {
  const reservations = getReservations();
  if (reservations[index]) {
    reservations[index] = { ...reservations[index], ...value };
    setData('予約機能', reservations);
  } else {
    console.warn(`指定された index（${index}）に該当する予約が見つかりません`);
  }
}

function hasInitializedData() {
  return Object.values(keys).some(key => storage.getItem(`${envKey}_${key}`) !== null);
}

function initialize() {
  try {
    // 既存データがある場合は初期化をスキップ
    if (hasInitializedData()) {
      console.log('既存のデータが存在するため、初期化をスキップします');
      return;
    }

    Object.entries(keys).forEach(([label, storageKey]) => {
      const tableData = dataTables.find(table => table.label === label);
      if (tableData) {
        setData(label, tableData.value);
      }
    });
  } catch (error) {
    console.error('データの初期化中にエラーが発生しました:', error);
  }
}

initialize();
