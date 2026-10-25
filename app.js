/**
 * NutriDaily | 个人营养与晨练日志核心逻辑
 * 针对: 30岁, 171cm, 55kg, 倒金字塔 (早大午中晚小), 无麸质, 晨练力量
 */

(function () {
  'use strict';

  // --- 1. 常量与默认配置 ---
  const DEFAULT_CONFIG = {
    gistId: '63f863a7fb3f4e6e00ab8e66ef2b7a31',
    token: '', // 从 URL #setup= 或设置中注入，严禁硬编码进仓库
    pin: '668899',
    targetCalories: 1950,
    targetProtein: 85,
    targetCarbs: 230,
    targetFat: 65,
  };

  const STANDARD_PRESET = {
    workout: {
      completed: true,
      notes: '晨间力量训练45min (状态充沛)',
      food: '温水 200ml + 半根香蕉',
      calories: 50,
      protein: 1,
      carbs: 12,
      fat: 0,
    },
    breakfast: {
      text: '3个水煮蛋(全蛋) + 250ml自制无糖酸奶 + 200g蒸红薯(慢碳) + 10ml特级初榨橄榄油 + 半根香蕉',
      calories: 750,
      protein: 33,
      carbs: 65,
      fat: 26,
    },
    lunch: {
      text: '1拳杂粮饭(180g熟重) + 120g去皮鸡腿排/清蒸鱼 + 250g清炒西兰花/菜心(深色蔬菜)',
      calories: 650,
      protein: 28,
      carbs: 60,
      fat: 20,
    },
    dinner: {
      text: '1小碗小米粥(120g熟重) + 白灼鲜虾8-10只/清蒸鲈鱼 + 200g温热冬瓜/小白菜清汤',
      calories: 450,
      protein: 22,
      carbs: 40,
      fat: 10,
    },
    glutenFree: true,
    weight: 55.0,
    gutFeeling: '4',
    notes: '一上午脑力充沛，下午完全无饭困，晚上睡眠沉稳',
  };

  // --- 2. 状态管理 ---
  let state = {
    currentDate: getTodayDateString(),
    config: loadConfig(),
    records: loadLocalRecords(),
    isUnlocked: false,
    inputPin: '',
  };

  // --- 3. 初始化与事件绑定 ---
  document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    checkUrlSetup();
    initPinLock();
    bindEvents();
    renderCurrentDay();
    registerServiceWorker();

    // 尝试在后台悄悄进行一次云同步
    if (state.config.token && state.config.gistId) {
      syncFromCloud(false);
    }
  });

  // --- 4. URL 快速配置解析 (#setup=BASE64) ---
  function checkUrlSetup() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#setup=')) {
      try {
        const encoded = hash.substring(7);
        const decoded = JSON.parse(atob(encoded));
        if (decoded.token && decoded.gistId) {
          state.config.token = decoded.token;
          state.config.gistId = decoded.gistId;
          if (decoded.pin) state.config.pin = decoded.pin;
          saveConfig(state.config);
          showToast('🎉 云同步配置已自动完成！');
          // 抹除 URL 中的 Hash，防泄露
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (e) {
        console.error('Failed to parse setup URL', e);
      }
    }
  }

  // --- 5. PIN 锁屏逻辑 ---
  function initPinLock() {
    const lockScreen = document.getElementById('pin-screen');
    const unlockedTimestamp = sessionStorage.getItem('nutri_unlocked_time');

    // 如果 2 小时内在当前会话中已解锁，自动放行
    if (unlockedTimestamp && Date.now() - parseInt(unlockedTimestamp, 10) < 2 * 60 * 60 * 1000) {
      state.isUnlocked = true;
      lockScreen.classList.add('hidden');
      return;
    }

    state.isUnlocked = false;
    state.inputPin = '';
    renderPinDots();

    // 数字键盘点击
    document.querySelectorAll('.keypad-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (state.inputPin.length < 6) {
          state.inputPin += val;
          renderPinDots();
          if (state.inputPin.length === 6) {
            verifyPin();
          }
        }
      });
    });

    // 物理键盘监听
    window.addEventListener('keydown', (e) => {
      if (state.isUnlocked) return;
      if (/^[0-9]$/.test(e.key)) {
        if (state.inputPin.length < 6) {
          state.inputPin += e.key;
          renderPinDots();
          if (state.inputPin.length === 6) verifyPin();
        }
      } else if (e.key === 'Backspace') {
        state.inputPin = state.inputPin.slice(0, -1);
        renderPinDots();
      }
    });

    document.getElementById('btn-clear-pin').addEventListener('click', () => {
      state.inputPin = '';
      renderPinDots();
    });

    document.getElementById('btn-backspace').addEventListener('click', () => {
      state.inputPin = state.inputPin.slice(0, -1);
      renderPinDots();
    });
  }

  function renderPinDots() {
    const dots = document.getElementById('pin-dots').children;
    for (let i = 0; i < 6; i++) {
      if (i < state.inputPin.length) {
        dots[i].classList.add('bg-emerald-500', 'border-emerald-500');
        dots[i].classList.remove('border-gray-600', 'bg-transparent');
      } else {
        dots[i].classList.remove('bg-emerald-500', 'border-emerald-500');
        dots[i].classList.add('border-gray-600');
      }
    }
  }

  function verifyPin() {
    const correctPin = state.config.pin || DEFAULT_CONFIG.pin;
    const lockScreen = document.getElementById('pin-screen');
    const pinError = document.getElementById('pin-error');

    if (state.inputPin === correctPin) {
      state.isUnlocked = true;
      sessionStorage.setItem('nutri_unlocked_time', Date.now().toString());
      lockScreen.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        lockScreen.classList.add('hidden');
        lockScreen.classList.remove('opacity-0', 'pointer-events-none');
      }, 300);
      pinError.textContent = '';
    } else {
      pinError.textContent = '密码错误，请重新输入';
      lockScreen.classList.add('shake');
      setTimeout(() => {
        lockScreen.classList.remove('shake');
        state.inputPin = '';
        renderPinDots();
      }, 400);
    }
  }

  function lockApp() {
    state.isUnlocked = false;
    state.inputPin = '';
    sessionStorage.removeItem('nutri_unlocked_time');
    const lockScreen = document.getElementById('pin-screen');
    renderPinDots();
    lockScreen.classList.remove('hidden');
  }

  // --- 6. 交互事件绑定 ---
  function bindEvents() {
    // 日期切换
    document.getElementById('btn-prev-day').addEventListener('click', () => changeDate(-1));
    document.getElementById('btn-next-day').addEventListener('click', () => changeDate(1));
    document.getElementById('btn-today').addEventListener('click', () => {
      state.currentDate = getTodayDateString();
      renderCurrentDay();
    });

    // 锁定按钮
    document.getElementById('btn-lock').addEventListener('click', lockApp);

    // 一键填满今日标准餐
    document.getElementById('btn-quick-fill-all').addEventListener('click', () => {
      applyStandardPreset();
      showToast('🌟 已载入全套“早大午中晚小”标准食谱！');
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
      });
    });

    // 快速添加食物标签
    document.querySelectorAll('.tag-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const food = btn.getAttribute('data-food');
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
          const current = targetInput.value.trim();
          targetInput.value = current ? `${current} + ${food}` : food;
          recalculateCurrentDay();
        }
      });
    });

    // 实时监听输入
    ['input-breakfast', 'input-lunch', 'input-dinner'].forEach((id) => {
      document.getElementById(id).addEventListener('input', () => {
        recalculateCurrentDay();
      });
    });

    // 运动复选框与无麸质复选框
    document.getElementById('check-workout').addEventListener('change', recalculateCurrentDay);
    document.getElementById('check-gf').addEventListener('change', recalculateCurrentDay);
    document.getElementById('input-weight').addEventListener('change', recalculateCurrentDay);
    document.getElementById('select-gut-feeling').addEventListener('change', recalculateCurrentDay);
    document.getElementById('input-daily-notes').addEventListener('change', recalculateCurrentDay);

    // 保存并同步按钮
    document.getElementById('btn-save-sync').addEventListener('click', () => {
      saveCurrentDay(true);
    });

    // 弹窗管理
    document.getElementById('btn-open-calendar').addEventListener('click', openCalendarModal);
    document.getElementById('btn-close-calendar').addEventListener('click', closeCalendarModal);
    document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);

    // 设置功能
    document.getElementById('btn-update-pin').addEventListener('click', updatePin);
    document.getElementById('btn-copy-setup-link').addEventListener('click', copySetupLink);
    document.getElementById('btn-export-json').addEventListener('click', exportJson);
    document.getElementById('file-import-json').addEventListener('change', importJson);
    document.getElementById('btn-force-sync').addEventListener('click', () => syncFromCloud(true));
  }

  // --- 7. 日期与渲染逻辑 ---
  function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function changeDate(daysOffset) {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + daysOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    state.currentDate = `${year}-${month}-${day}`;
    renderCurrentDay();
  }

  function renderCurrentDay() {
    const dateStr = state.currentDate;
    const isToday = dateStr === getTodayDateString();

    // 更新日期显示
    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    document.getElementById('display-date').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    document.getElementById('display-weekday').textContent = weekdays[d.getDay()];
    document.getElementById('btn-today').classList.toggle('hidden', isToday);

    // 加载已有记录或空模板
    const record = state.records[dateStr] || {
      workout: { completed: false, notes: '', calories: 50 },
      breakfast: { text: '', calories: 0, protein: 0 },
      lunch: { text: '', calories: 0, protein: 0 },
      dinner: { text: '', calories: 0, protein: 0 },
      glutenFree: true,
      weight: 55.0,
      gutFeeling: '4',
      notes: '',
    };

    // 填入表单
    document.getElementById('check-workout').checked = !!record.workout?.completed;
    document.getElementById('input-workout-notes').value = record.workout?.notes || '';
    document.getElementById('input-breakfast').value = record.breakfast?.text || '';
    document.getElementById('input-lunch').value = record.lunch?.text || '';
    document.getElementById('input-dinner').value = record.dinner?.text || '';
    document.getElementById('check-gf').checked = record.glutenFree !== false;
    document.getElementById('input-weight').value = record.weight || 55.0;
    document.getElementById('select-gut-feeling').value = record.gutFeeling || '4';
    document.getElementById('input-daily-notes').value = record.notes || '';

    // 重新计算并更新图表数据
    updateSummaryStats(record);
  }

  function applyStandardPreset() {
    document.getElementById('check-workout').checked = true;
    document.getElementById('input-workout-notes').value = STANDARD_PRESET.workout.notes;
    document.getElementById('input-breakfast').value = STANDARD_PRESET.breakfast.text;
    document.getElementById('input-lunch').value = STANDARD_PRESET.lunch.text;
    document.getElementById('input-dinner').value = STANDARD_PRESET.dinner.text;
    document.getElementById('check-gf').checked = true;
    document.getElementById('input-weight').value = STANDARD_PRESET.weight;
    document.getElementById('select-gut-feeling').value = STANDARD_PRESET.gutFeeling;
    document.getElementById('input-daily-notes').value = STANDARD_PRESET.notes;

    recalculateCurrentDay();
  }

  // --- 8. 营养计算与倒金字塔分析 ---
  function recalculateCurrentDay() {
    const record = {
      workout: {
        completed: document.getElementById('check-workout').checked,
        notes: document.getElementById('input-workout-notes').value,
        food: '温水 200ml + 半根香蕉',
        calories: 50,
        protein: 1,
        carbs: 12,
        fat: 0,
      },
      breakfast: estimateMealNutrition(document.getElementById('input-breakfast').value, 'breakfast'),
      lunch: estimateMealNutrition(document.getElementById('input-lunch').value, 'lunch'),
      dinner: estimateMealNutrition(document.getElementById('input-dinner').value, 'dinner'),
      glutenFree: document.getElementById('check-gf').checked,
      weight: parseFloat(document.getElementById('input-weight').value) || 55.0,
      gutFeeling: document.getElementById('select-gut-feeling').value,
      notes: document.getElementById('input-daily-notes').value,
    };

    updateSummaryStats(record);
    saveCurrentDay(false); // 本地静默保存
  }

  function estimateMealNutrition(text, type) {
    if (!text || text.trim() === '') {
      return { text: '', calories: 0, protein: 0, carbs: 0, fat: 0 };
    }

    // 若包含标准食谱关键字，直接匹配标准高质量数值
    if (type === 'breakfast' && (text.includes('水煮蛋') && text.includes('酸奶'))) {
      return { text, calories: 750, protein: 33, carbs: 65, fat: 26 };
    }
    if (type === 'lunch' && (text.includes('杂粮饭') || text.includes('鸡腿') || text.includes('鱼'))) {
      return { text, calories: 650, protein: 28, carbs: 60, fat: 20 };
    }
    if (type === 'dinner' && (text.includes('小米粥') || text.includes('虾') || text.includes('豆腐'))) {
      return { text, calories: 450, protein: 22, carbs: 40, fat: 10 };
    }

    // 默认兜底估算
    let calories = type === 'breakfast' ? 600 : type === 'lunch' ? 550 : 400;
    let protein = type === 'breakfast' ? 25 : type === 'lunch' ? 24 : 18;
    return { text, calories, protein, carbs: Math.round(calories * 0.5 / 4), fat: Math.round(calories * 0.25 / 9) };
  }

  function updateSummaryStats(record) {
    const workoutCal = record.workout?.completed ? 50 : 0;
    const bCal = record.breakfast?.calories || 0;
    const lCal = record.lunch?.calories || 0;
    const dCal = record.dinner?.calories || 0;

    const totalCal = workoutCal + bCal + lCal + dCal;
    const bProt = record.breakfast?.protein || 0;
    const lProt = record.lunch?.protein || 0;
    const dProt = record.dinner?.protein || 0;
    const totalProt = (record.workout?.completed ? 1 : 0) + bProt + lProt + dProt;

    // 更新 DOM 文本
    document.getElementById('total-calories').textContent = totalCal;
    document.getElementById('total-protein').textContent = totalProt;
    document.getElementById('breakfast-cal').textContent = `~${bCal} kcal`;
    document.getElementById('breakfast-protein').textContent = `~${bProt}g 蛋白`;
    document.getElementById('lunch-cal').textContent = `~${lCal} kcal`;
    document.getElementById('lunch-protein').textContent = `~${lProt}g 蛋白`;
    document.getElementById('dinner-cal').textContent = `~${dCal} kcal`;
    document.getElementById('dinner-protein').textContent = `~${dProt}g 蛋白`;

    const carbs = Math.round(totalCal * 0.48 / 4);
    const fat = Math.round(totalCal * 0.28 / 9);
    document.getElementById('total-carbs').textContent = `${carbs}g`;
    document.getElementById('total-fat').textContent = `${fat}g`;

    // 进度条更新
    const calPct = Math.min(Math.round((totalCal / state.config.targetCalories) * 100), 100);
    document.getElementById('calories-pct').textContent = `${calPct}%`;
    document.getElementById('calories-bar').style.width = `${calPct}%`;

    const protPct = Math.min(Math.round((totalProt / state.config.targetProtein) * 100), 100);
    document.getElementById('protein-bar').style.width = `${protPct}%`;

    // 无麸质指示
    const gfPill = document.getElementById('gf-status-pill');
    if (record.glutenFree !== false) {
      gfPill.textContent = '100% 安全';
      gfPill.className = 'text-emerald-400 font-semibold';
    } else {
      gfPill.textContent = '⚠️ 存疑排查';
      gfPill.className = 'text-rose-400 font-semibold';
    }

    // 倒金字塔比例计算 (早 : 午 : 晚)
    const mealSum = (bCal + lCal + dCal) || 1;
    const bPct = Math.round((bCal / mealSum) * 100);
    const lPct = Math.round((lCal / mealSum) * 100);
    const dPct = 100 - bPct - lPct;

    document.getElementById('pct-breakfast').textContent = `${bPct}%`;
    document.getElementById('pct-lunch').textContent = `${lPct}%`;
    document.getElementById('pct-dinner').textContent = `${dPct}%`;

    document.getElementById('bar-breakfast').style.width = `${bPct}%`;
    document.getElementById('bar-lunch').style.width = `${lPct}%`;
    document.getElementById('bar-dinner').style.width = `${Math.max(dPct, 0)}%`;

    const pyramidBadge = document.getElementById('pyramid-badge');
    if (bCal >= lCal && lCal >= dCal && dCal > 0) {
      pyramidBadge.textContent = '🌟 完美倒金字塔 (早大午中晚小)';
      pyramidBadge.className = 'px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-medium';
    } else if (dCal > bCal && dCal > 0) {
      pyramidBadge.textContent = '⚠️ 晚餐偏重，建议轻量化助眠';
      pyramidBadge.className = 'px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-800/60 font-medium';
    } else {
      pyramidBadge.textContent = '能量结构良好';
      pyramidBadge.className = 'px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 font-medium';
    }
  }

  // --- 9. 数据存储与 GitHub Gist 私有云同步 ---
  function loadConfig() {
    try {
      const saved = localStorage.getItem('nutri_config');
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    state.config = cfg;
    localStorage.setItem('nutri_config', JSON.stringify(cfg));
  }

  function loadLocalRecords() {
    try {
      const saved = localStorage.getItem('nutri_records');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  function saveLocalRecords(records) {
    state.records = records;
    localStorage.setItem('nutri_records', JSON.stringify(records));
  }

  function saveCurrentDay(triggerCloudSync) {
    const dateStr = state.currentDate;
    const currentRecord = {
      workout: {
        completed: document.getElementById('check-workout').checked,
        notes: document.getElementById('input-workout-notes').value,
        food: '温水 200ml + 半根香蕉',
        calories: 50,
        protein: 1,
        carbs: 12,
        fat: 0,
      },
      breakfast: estimateMealNutrition(document.getElementById('input-breakfast').value, 'breakfast'),
      lunch: estimateMealNutrition(document.getElementById('input-lunch').value, 'lunch'),
      dinner: estimateMealNutrition(document.getElementById('input-dinner').value, 'dinner'),
      glutenFree: document.getElementById('check-gf').checked,
      weight: parseFloat(document.getElementById('input-weight').value) || 55.0,
      gutFeeling: document.getElementById('select-gut-feeling').value,
      notes: document.getElementById('input-daily-notes').value,
      updatedAt: new Date().toISOString(),
    };

    state.records[dateStr] = currentRecord;
    saveLocalRecords(state.records);

    if (triggerCloudSync) {
      syncToCloud();
    }
  }

  // 云同步：上传到 Gist
  async function syncToCloud() {
    const { token, gistId } = state.config;
    const btn = document.getElementById('btn-save-sync');
    const btnText = document.getElementById('btn-save-text');

    if (!token || !gistId) {
      showToast('⚠️ 本地保存成功！未配置云端密钥，仅保存在当前设备');
      return;
    }

    try {
      btnText.textContent = '正在同步到 GitHub 云端...';
      updateSyncStatusBadge('syncing');

      const payload = {
        records: state.records,
        settings: {
          targetCalories: state.config.targetCalories,
          targetProtein: state.config.targetProtein,
        },
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: {
            'diet-data.json': {
              content: JSON.stringify(payload, null, 2),
            },
          },
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      updateSyncStatusBadge('synced');
      btnText.textContent = '保存今日打卡并同步云端';
      showToast('✅ 已成功同步到 GitHub 私有云！');
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.9 },
      });
    } catch (err) {
      console.error('Sync failed', err);
      updateSyncStatusBadge('error');
      btnText.textContent = '保存今日打卡并同步云端';
      showToast('⚠️ 同步失败，数据已在本地妥善保存');
    }
  }

  // 云同步：从 Gist 拉取
  async function syncFromCloud(showToastOnDone = true) {
    const { token, gistId } = state.config;
    if (!token || !gistId) return;

    try {
      updateSyncStatusBadge('syncing');
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const contentStr = data.files['diet-data.json']?.content;

      if (contentStr) {
        const parsed = JSON.parse(contentStr);
        if (parsed.records) {
          // 合并本地与云端
          state.records = { ...state.records, ...parsed.records };
          saveLocalRecords(state.records);
          renderCurrentDay();
        }
      }
      updateSyncStatusBadge('synced');
      if (showToastOnDone) showToast('☁️ 已从云端拉取最新记录！');
    } catch (err) {
      console.error('Fetch cloud failed', err);
      updateSyncStatusBadge('error');
    }
  }

  function updateSyncStatusBadge(status) {
    const badge = document.getElementById('sync-status');
    if (!badge) return;
    if (status === 'synced') {
      badge.className = 'flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/50';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"></span><span>已同步云端</span>';
    } else if (status === 'syncing') {
      badge.className = 'flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-950 text-cyan-400 border border-cyan-800/50';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mr-1"></span><span>正在同步...</span>';
    } else {
      badge.className = 'flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-400 border border-amber-800/50';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1"></span><span>离线模式</span>';
    }
  }

  // --- 10. 日历弹窗 ---
  function openCalendarModal() {
    const modal = document.getElementById('modal-calendar');
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const days = ['日', '一', '二', '三', '四', '五', '六'];
    days.forEach((day) => {
      const header = document.createElement('div');
      header.className = 'font-bold text-gray-500 py-1';
      header.textContent = day;
      grid.appendChild(header);
    });

    const now = new Date(state.currentDate);
    const year = now.getFullYear();
    const month = now.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasRecord = !!state.records[dateKey];
      const isSelected = dateKey === state.currentDate;

      const cell = document.createElement('button');
      cell.className = `p-2 rounded-xl flex flex-col items-center justify-center transition ${
        isSelected
          ? 'bg-emerald-600 text-white font-bold'
          : 'bg-gray-950 hover:bg-gray-800 text-gray-300'
      }`;
      cell.innerHTML = `
        <span class="text-xs">${d}</span>
        ${hasRecord ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>' : '<span class="w-1.5 h-1.5 mt-1"></span>'}
      `;
      cell.addEventListener('click', () => {
        state.currentDate = dateKey;
        renderCurrentDay();
        closeCalendarModal();
      });
      grid.appendChild(cell);
    }

    modal.classList.remove('hidden');
  }

  function closeCalendarModal() {
    document.getElementById('modal-calendar').classList.add('hidden');
  }

  // --- 11. 设置与多端同步 ---
  function openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    document.getElementById('text-gist-id').textContent = state.config.gistId ? `${state.config.gistId.slice(0, 8)}...` : '未设置';
    modal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    document.getElementById('modal-settings').classList.add('hidden');
  }

  function updatePin() {
    const input = document.getElementById('input-new-pin');
    const val = input.value.trim();
    if (/^\d{6}$/.test(val)) {
      state.config.pin = val;
      saveConfig(state.config);
      input.value = '';
      showToast('✅ 访问密码已更新为 ' + val);
    } else {
      showToast('⚠️ 请输入完整的 6 位数字');
    }
  }

  function copySetupLink() {
    const payload = {
      gistId: state.config.gistId,
      token: state.config.token,
      pin: state.config.pin,
    };
    const b64 = btoa(JSON.stringify(payload));
    const url = `${window.location.origin}${window.location.pathname}#setup=${b64}`;

    navigator.clipboard.writeText(url).then(() => {
      showToast('📋 手机配置链接已复制！发送到微信/备忘录在手机打开即可');
    }).catch(() => {
      prompt('请手动复制以下配置链接在手机打开：', url);
    });
  }

  function exportJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.records, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `nutri-daily-backup-${getTodayDateString()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        state.records = { ...state.records, ...imported };
        saveLocalRecords(state.records);
        renderCurrentDay();
        showToast('✅ 备份数据已导入成功！');
      } catch (err) {
        showToast('❌ JSON 文件格式错误');
      }
    };
    reader.readAsText(file);
  }

  // --- 12. Toast 提示 ---
  function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    toastMsg.textContent = msg;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2500);
  }

  // --- 13. Service Worker (离线与极速加载) ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW register skipped', err);
      });
    }
  }

})();
