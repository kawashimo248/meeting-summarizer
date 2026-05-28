/* ==========================================================================
   JavaScript Application Logic: AI Minutes Generator (Gemini-only version - v5.3)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // 1. Config & State Variables
    // ---------------------------------------------------------
    const GEMINI_MODEL = 'gemini-2.5-flash'; 
    
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    let selectedFile = null;
    let recordTimerInterval = null;
    let recordSeconds = 0;
    
    // Audio Context for Visualizer
    let audioCtx = null;
    let analyser = null;
    let sourceNode = null;
    let visualizerAnimId = null;
    let streamRef = null;

    // DOM Elements
    const elements = {
        // API Status
        apiStatusBanner: document.getElementById('api-status-banner'),
        
        // Navigation Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        
        // Recorder
        timerDisplay: document.getElementById('record-timer'),
        visualizerPulse: document.getElementById('visualizer-pulse'),
        visualizerCanvas: document.getElementById('audio-visualizer'),
        recorderStatus: document.getElementById('recorder-status'),
        btnRecordStart: document.getElementById('btn-record-start'),
        btnRecordPause: document.getElementById('btn-record-pause'),
        btnRecordStop: document.getElementById('btn-record-stop'),
        
        // Upload
        dropZone: document.getElementById('drop-zone'),
        audioFileInput: document.getElementById('audio-file-input'),
        selectedFileInfo: document.getElementById('selected-file-info'),
        selectedFileName: document.getElementById('selected-file-name'),
        selectedFileSize: document.getElementById('selected-file-size'),
        btnClearFile: document.getElementById('btn-clear-file'),
        
        // Options
        templateSelect: document.getElementById('template-select'),
        customInstruction: document.getElementById('custom-instruction'),
        btnProcess: document.getElementById('btn-process'),
        
        // Loading & Overlay
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
        progressBar: document.getElementById('progress-bar'),
        
        // Output result
        resultTabBtns: document.querySelectorAll('.result-tab-btn'),
        resultPanes: document.querySelectorAll('.result-pane'),
        summaryPlaceholder: document.getElementById('summary-placeholder'),
        summaryRendered: document.getElementById('summary-rendered'),
        transcriptPlaceholder: document.getElementById('transcript-placeholder'),
        transcriptRaw: document.getElementById('transcript-raw'),
        btnCopy: document.getElementById('btn-copy'),
        btnDownload: document.getElementById('btn-download'),
        btnEmail: document.getElementById('btn-email'),
        
        // Settings Modal
        btnSettingsToggle: document.getElementById('btn-settings-toggle'),
        settingsModal: document.getElementById('settings-modal'),
        btnSettingsClose: document.getElementById('btn-settings-close'),
        geminiApiKey: document.getElementById('gemini-api-key'),
        btnSettingsSave: document.getElementById('btn-settings-save'),
        toggleVisibilityBtns: document.querySelectorAll('.btn-toggle-visibility')
    };

    // ---------------------------------------------------------
    // 2. Helper Functions (Defined early to prevent ReferenceErrors)
    // ---------------------------------------------------------
    
    // 安全にLucideアイコンをレンダリングする関数
    function safeCreateIcons() {
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        } catch (e) {
            console.warn("Lucideアイコンの描画に失敗しました:", e);
        }
    }

    function showLoading(show, text = "") {
        if (!elements.loadingOverlay) return;
        if (show) {
            if (elements.loadingText) elements.loadingText.innerText = text;
            elements.loadingOverlay.classList.remove('hidden');
        } else {
            elements.loadingOverlay.classList.add('hidden');
        }
    }

    function setProgressBar(percent) {
        if (elements.progressBar) {
            elements.progressBar.style.width = `${percent}%`;
        }
    }

    // ---------------------------------------------------------
    // 3. API Key Management (LocalStorage)
    // ---------------------------------------------------------
    function getApiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    }

    function checkApiKeyConfigured() {
        const key = getApiKey();
        const isConfigured = key.trim() !== '';
        
        if (elements.apiStatusBanner) {
            if (isConfigured) {
                elements.apiStatusBanner.classList.add('hidden');
                elements.apiStatusBanner.classList.remove('warning');
            } else {
                elements.apiStatusBanner.classList.remove('hidden');
                elements.apiStatusBanner.classList.add('warning');
                const span = elements.apiStatusBanner.querySelector('span');
                if (span) {
                    span.innerText = 'Gemini APIキーが設定されていません。右上の設定アイコンから登録してください。（またはデモ実行可能です）';
                }
            }
        }
        updateProcessButtonState();
    }

    function loadSavedKeys() {
        if (elements.geminiApiKey) {
            elements.geminiApiKey.value = getApiKey();
        }
        checkApiKeyConfigured();
    }

    // Toggle password visibility
    if (elements.toggleVisibilityBtns) {
        elements.toggleVisibilityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    const icon = btn.querySelector('i');
                    if (targetInput.type === 'password') {
                        targetInput.type = 'text';
                        if (icon) icon.setAttribute('data-lucide', 'eye-off');
                    } else {
                        targetInput.type = 'password';
                        if (icon) icon.setAttribute('data-lucide', 'eye');
                    }
                    safeCreateIcons();
                }
            });
        });
    }

    // Modal Actions
    if (elements.btnSettingsToggle) {
        elements.btnSettingsToggle.addEventListener('click', () => {
            loadSavedKeys();
            if (elements.settingsModal) elements.settingsModal.classList.remove('hidden');
        });
    }

    if (elements.btnSettingsClose) {
        elements.btnSettingsClose.addEventListener('click', () => {
            if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
        });
    }

    if (elements.btnSettingsSave) {
        elements.btnSettingsSave.addEventListener('click', () => {
            if (elements.geminiApiKey) {
                localStorage.setItem('gemini_api_key', elements.geminiApiKey.value.trim());
            }
            checkApiKeyConfigured();
            if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
        });
    }

    if (elements.settingsModal) {
        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) {
                elements.settingsModal.classList.add('hidden');
            }
        });
    }

    // ---------------------------------------------------------
    // 4. Navigation Tabs
    // ---------------------------------------------------------
    if (elements.tabBtns) {
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                elements.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                elements.tabPanes.forEach(pane => pane.classList.remove('active'));
                const targetPane = document.getElementById(targetTab);
                if (targetPane) targetPane.classList.add('active');
                
                if (targetTab !== 'tab-record' && mediaRecorder && mediaRecorder.state !== 'inactive') {
                    stopRecording();
                }
                
                updateProcessButtonState();
            });
        });
    }

    // Output Result Tabs
    if (elements.resultTabBtns) {
        elements.resultTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPane = btn.getAttribute('data-result-tab');
                
                elements.resultTabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                elements.resultPanes.forEach(p => p.classList.remove('active'));
                const pane = document.getElementById(targetPane);
                if (pane) pane.classList.add('active');
            });
        });
    }

    // ---------------------------------------------------------
    // 5. Input State & UI updates
    // ---------------------------------------------------------
    function updateProcessButtonState() {
        const activeTabEl = document.querySelector('.tab-btn.active');
        if (!activeTabEl) return;
        const activeTab = activeTabEl.getAttribute('data-tab');
        let hasInput = false;
        
        if (activeTab === 'tab-record') {
            hasInput = audioBlob !== null;
        } else if (activeTab === 'tab-upload') {
            hasInput = selectedFile !== null;
        }
        
        if (elements.btnProcess) {
            elements.btnProcess.disabled = !hasInput;
        }
    }

    // ---------------------------------------------------------
    // 6. Microphone Recording (Web Audio API)
    // ---------------------------------------------------------
    async function startRecording() {
        audioChunks = [];
        audioBlob = null;
        updateProcessButtonState();
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef = stream;
            
            setupVisualizer(stream);
            
            let options = {};
            const types = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                'audio/webm',
                'audio/wav'
            ];
            
            for (const type of types) {
                if (MediaRecorder.isTypeSupported(type)) {
                    options = { mimeType: type };
                    break;
                }
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/wav' });
                if (elements.recorderStatus) {
                    elements.recorderStatus.innerText = `録音が完了しました (ファイルサイズ: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`;
                }
                
                if (streamRef) {
                    streamRef.getTracks().forEach(track => track.stop());
                }
                cancelAnimationFrame(visualizerAnimId);
                clearCanvas();
                
                if (elements.visualizerPulse) elements.visualizerPulse.classList.remove('recording');
                if (elements.btnRecordStart) elements.btnRecordStart.classList.remove('hidden');
                if (elements.btnRecordPause) elements.btnRecordPause.classList.add('hidden');
                if (elements.btnRecordStop) elements.btnRecordStop.classList.add('hidden');
                
                updateProcessButtonState();
            };
            
            mediaRecorder.start(1000);
            if (elements.visualizerPulse) elements.visualizerPulse.classList.add('recording');
            
            recordSeconds = 0;
            updateTimerDisplay();
            if (elements.recorderStatus) elements.recorderStatus.innerText = '録音中...';
            
            if (elements.btnRecordStart) elements.btnRecordStart.classList.add('hidden');
            if (elements.btnRecordPause) elements.btnRecordPause.classList.remove('hidden');
            if (elements.btnRecordStop) elements.btnRecordStop.classList.remove('hidden');
            
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                updateTimerDisplay();
            }, 1000);
            
        } catch (err) {
            console.error('マイクのアクセスに失敗しました:', err);
            if (elements.recorderStatus) {
                elements.recorderStatus.innerText = 'マイクの使用許可がないか、接続エラーが発生しました。';
            }
            alert('マイクへのアクセスを許可してください。スマホの設定またはブラウザのアドレスバー横の鍵アイコンから変更できます。');
        }
    }

    function pauseRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
            clearInterval(recordTimerInterval);
            if (elements.recorderStatus) elements.recorderStatus.innerText = '録音を一時停止中';
            if (elements.btnRecordPause) {
                const icon = elements.btnRecordPause.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'play');
            }
            if (elements.visualizerPulse) elements.visualizerPulse.classList.remove('recording');
            safeCreateIcons();
        } else if (mediaRecorder && mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
            if (elements.recorderStatus) elements.recorderStatus.innerText = '録音中...';
            if (elements.btnRecordPause) {
                const icon = elements.btnRecordPause.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'pause');
            }
            if (elements.visualizerPulse) elements.visualizerPulse.classList.add('recording');
            safeCreateIcons();
            
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                updateTimerDisplay();
            }, 1000);
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            clearInterval(recordTimerInterval);
        }
    }

    function updateTimerDisplay() {
        const mins = Math.floor(recordSeconds / 60).toString().padStart(2, '0');
        const secs = (recordSeconds % 60).toString().padStart(2, '0');
        if (elements.timerDisplay) {
            elements.timerDisplay.innerText = `${mins}:${secs}`;
        }
    }

    // ---------------------------------------------------------
    // 7. Audio Visualizer (Canvas Rendering)
    // ---------------------------------------------------------
    function setupVisualizer(stream) {
        if (!elements.visualizerCanvas) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            sourceNode = audioCtx.createMediaStreamSource(stream);
            sourceNode.connect(analyser);
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            const canvas = elements.visualizerCanvas;
            const canvasCtx = canvas.getContext('2d');
            
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            
            function draw() {
                visualizerAnimId = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                canvasCtx.fillStyle = 'rgba(9, 13, 22, 0.2)';
                canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
                
                const barWidth = (canvas.width / bufferLength) * 1.5;
                let barHeight;
                let x = 0;
                
                for(let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] * 0.45;
                    
                    const grad = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
                    grad.addColorStop(0, '#3b82f6');
                    grad.addColorStop(0.5, '#8b5cf6');
                    grad.addColorStop(1, '#d946ef');
                    
                    canvasCtx.fillStyle = grad;
                    canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                    
                    x += barWidth;
                }
            }
            
            draw();
        } catch (e) {
            console.warn("ビジュアライザーの初期化に失敗しました:", e);
        }
    }

    function clearCanvas() {
        if (!elements.visualizerCanvas) return;
        const canvas = elements.visualizerCanvas;
        const canvasCtx = canvas.getContext('2d');
        if (canvasCtx) {
            canvasCtx.fillStyle = '#090d16';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    if (elements.btnRecordStart) elements.btnRecordStart.addEventListener('click', startRecording);
    if (elements.btnRecordPause) elements.btnRecordPause.addEventListener('click', pauseRecording);
    if (elements.btnRecordStop) elements.btnRecordStop.addEventListener('click', stopRecording);

    // ---------------------------------------------------------
    // 8. File Upload (Drag & Drop)
    // ---------------------------------------------------------
    if (elements.dropZone) {
        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.remove('dragover'), false);
        });

        elements.dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                handleSelectedFile(files[0]);
            }
        });

        elements.dropZone.addEventListener('click', () => {
            if (elements.audioFileInput) elements.audioFileInput.click();
        });
    }

    if (elements.audioFileInput) {
        elements.audioFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleSelectedFile(e.target.files[0]);
            }
        });
    }

    function handleSelectedFile(file) {
        if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3') && !file.name.endsWith('.m4a') && !file.name.endsWith('.wav') && !file.name.endsWith('.webm')) {
            alert('音声ファイル（mp3, wav, m4a, webmなど）を選択してください。');
            return;
        }

        const maxSize = 25 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('ファイルサイズが大きすぎます (最大25MB)。');
            return;
        }

        selectedFile = file;
        if (elements.selectedFileName) elements.selectedFileName.innerText = file.name;
        if (elements.selectedFileSize) elements.selectedFileSize.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        if (elements.dropZone) elements.dropZone.classList.add('hidden');
        if (elements.selectedFileInfo) elements.selectedFileInfo.classList.remove('hidden');
        
        updateProcessButtonState();
    }

    if (elements.btnClearFile) {
        elements.btnClearFile.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedFile = null;
            if (elements.audioFileInput) elements.audioFileInput.value = '';
            if (elements.dropZone) elements.dropZone.classList.remove('hidden');
            if (elements.selectedFileInfo) elements.selectedFileInfo.classList.add('hidden');
            updateProcessButtonState();
        });
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = error => reject(error);
        });
    }

    // ---------------------------------------------------------
    // 9. Processing & API Integrations
    // ---------------------------------------------------------
    if (elements.btnProcess) {
        elements.btnProcess.addEventListener('click', async () => {
            const key = getApiKey();
            const isDemoMode = key.trim() === '';
            
            if (isDemoMode) {
                const confirmDemo = confirm(
                    "Gemini APIキーが設定されていません。\n" +
                    "代わりに「デモシミュレーションモード」で議事録生成を試しますか？\n" +
                    "（API通信は行わず、自動的に高品質なサンプルの議事録を生成してUIの動きを体験できます。）"
                );
                if (!confirmDemo) return;
                
                runDemoProcess();
                return;
            }

            runRealProcess(key);
        });
    }

    async function runRealProcess(key) {
        showLoading(true, "音声データを読み込んでいます...");
        setProgressBar(10);
        
        let audioFileToUpload = null;
        const activeTabEl = document.querySelector('.tab-btn.active');
        if (!activeTabEl) {
            showLoading(false);
            return;
        }
        const activeTab = activeTabEl.getAttribute('data-tab');
        
        if (activeTab === 'tab-record') {
            if (!audioBlob) {
                alert('録音データが見つかりません。');
                showLoading(false);
                return;
            }
            
            let extension = "wav";
            let mimeType = audioBlob.type;
            if (mediaRecorder && mediaRecorder.mimeType) {
                if (mediaRecorder.mimeType.includes("mp4")) extension = "m4a";
                else if (mediaRecorder.mimeType.includes("webm")) extension = "webm";
                else if (mediaRecorder.mimeType.includes("ogg")) extension = "ogg";
            }
            
            if (!mimeType || mimeType === "") {
                mimeType = "audio/wav";
            }
            
            audioFileToUpload = new File([audioBlob], `recording.${extension}`, { type: mimeType });
        } else {
            if (!selectedFile) {
                alert('アップロードする音声ファイルが選択されていません。');
                showLoading(false);
                return;
            }
            audioFileToUpload = selectedFile;
        }

        try {
            showLoading(true, "音声をAI送信フォーマットに変換中...");
            setProgressBar(30);
            const base64Audio = await fileToBase64(audioFileToUpload);
            
            let fileMimeType = audioFileToUpload.type;
            if (fileMimeType && fileMimeType.includes(';')) {
                fileMimeType = fileMimeType.split(';')[0].trim();
            }
            
            if (!fileMimeType) {
                if (audioFileToUpload.name.endsWith('.mp3')) fileMimeType = 'audio/mp3';
                else if (audioFileToUpload.name.endsWith('.wav')) fileMimeType = 'audio/wav';
                else if (audioFileToUpload.name.endsWith('.m4a') || audioFileToUpload.name.endsWith('.mp4')) fileMimeType = 'audio/m4a';
                else if (audioFileToUpload.name.endsWith('.webm')) fileMimeType = 'audio/webm';
                else fileMimeType = 'audio/wav';
            }

            showLoading(true, "AIが音声を聞いて解析中 (これには数秒〜1分ほどかかります)...");
            setProgressBar(50);

            const template = elements.templateSelect ? elements.templateSelect.value : 'standard';
            const customIns = elements.customInstruction ? elements.customInstruction.value.trim() : '';
            const prompt = buildPrompt(template, customIns);

            const payload = {
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: fileMimeType,
                                data: base64Audio
                            }
                        },
                        {
                            text: prompt
                        }
                    ]
                }]
            };

            const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
            
            console.log("Gemini APIに送信中... モデル:", GEMINI_MODEL);
            console.log("送信MIMEタイプ:", fileMimeType);

            const geminiResponse = await fetch(apiEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!geminiResponse.ok) {
                const errData = await geminiResponse.json().catch(() => ({}));
                console.error("Gemini API エラー詳細:", errData);
                
                const apiErrorMessage = errData.error?.message || `HTTP status: ${geminiResponse.status}`;
                const apiErrorStatus = errData.error?.status || "UNKNOWN";
                const errorJsonString = JSON.stringify(errData, null, 2);
                
                displayErrorOnScreen(apiErrorMessage, apiErrorStatus, errorJsonString);
                throw new Error(`Gemini API エラー: ${apiErrorMessage} (ステータス: ${apiErrorStatus})`);
            }

            setProgressBar(80);
            const geminiData = await geminiResponse.json();
            
            let fullTextOutput = "";
            try {
                fullTextOutput = geminiData.candidates[0].content.parts[0].text;
            } catch (e) {
                console.error("パースエラー。API応答:", geminiData);
                throw new Error("Gemini から有効な解析結果が得られませんでした。応答フォーマットが想定外です。");
            }

            let transcriptText = "";
            let summaryMarkdown = "";

            const transcriptStart = fullTextOutput.indexOf("===TRANSCRIPT_START===");
            const transcriptEnd = fullTextOutput.indexOf("===TRANSCRIPT_END===");
            const summaryStart = fullTextOutput.indexOf("===SUMMARY_START===");
            const summaryEnd = fullTextOutput.indexOf("===SUMMARY_END===");

            if (transcriptStart !== -1 && transcriptEnd !== -1) {
                transcriptText = fullTextOutput.substring(transcriptStart + "===TRANSCRIPT_START===".length, transcriptEnd).trim();
            }
            
            if (summaryStart !== -1 && summaryEnd !== -1) {
                summaryMarkdown = fullTextOutput.substring(summaryStart + "===SUMMARY_START===".length, summaryEnd).trim();
            }

            if (!transcriptText || !summaryMarkdown) {
                console.warn("セパレータの抽出に失敗したため、代替パースを試みます。");
                
                const transMatch = fullTextOutput.match(/===TRANSCRIPT_START===([\s\S]*?)===TRANSCRIPT_END===/);
                const summMatch = fullTextOutput.match(/===SUMMARY_START===([\s\S]*?)===SUMMARY_END===/);
                
                if (transMatch) transcriptText = transMatch[1].trim();
                if (summMatch) summaryMarkdown = summMatch[1].trim();
                
                if (!summaryMarkdown) {
                    summaryMarkdown = fullTextOutput;
                    transcriptText = "文字起こしの自動分割に失敗しました。詳細な内容は要約結果タブをご確認ください。";
                }
            }

            setProgressBar(100);
            displayResults(transcriptText, summaryMarkdown);
            
        } catch (error) {
            console.error("処理エラー詳細:", error);
            if (elements.summaryRendered && !elements.summaryRendered.classList.contains('error-style-display')) {
                alert(`エラーが発生しました:\n${error.message}`);
            }
        } finally {
            showLoading(false);
        }
    }

    function displayErrorOnScreen(message, status, rawJson) {
        if (!elements.summaryRendered) return;
        
        if (elements.summaryPlaceholder) elements.summaryPlaceholder.classList.add('hidden');
        elements.summaryRendered.classList.remove('hidden');
        elements.summaryRendered.classList.add('error-style-display');
        
        elements.summaryRendered.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); padding: 18px; border-radius: var(--radius-sm); color: #fecaca; font-size: 0.9rem;">
                <h3 style="color: var(--danger); margin-bottom: 10px; font-family: var(--font-heading); display:flex; align-items:center; gap:8px;">
                    Google APIからエラーが返されました
                </h3>
                <p style="font-weight: 600; margin-bottom: 8px;">エラー理由: ${message}</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px;">ステータスコード: ${status}</p>
                
                <details style="margin-top: 12px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                    <summary style="cursor:pointer; font-size: 0.8rem; color: var(--primary);">デバッグ用の詳細データ (生JSON)</summary>
                    <pre style="font-family: monospace; font-size: 0.75rem; color: var(--text-secondary); white-space: pre-wrap; margin-top: 8px;">${rawJson}</pre>
                </details>
            </div>
        `;
        
        if (elements.transcriptPlaceholder) elements.transcriptPlaceholder.classList.add('hidden');
        if (elements.transcriptRaw) {
            elements.transcriptRaw.classList.remove('hidden');
            elements.transcriptRaw.value = `エラーが発生したため、文字起こしテキストは生成されませんでした。\nステータス: ${status}\nエラー内容: ${message}`;
        }
        
        if (elements.btnCopy) elements.btnCopy.disabled = true;
        if (elements.btnDownload) elements.btnDownload.disabled = true;
        if (elements.btnEmail) elements.btnEmail.disabled = true;
        
        safeCreateIcons();
        if (elements.resultTabBtns && elements.resultTabBtns[0]) {
            elements.resultTabBtns[0].click();
        }
    }

    function runDemoProcess() {
        showLoading(true, "音声をロード中 (デモモード)...");
        setProgressBar(15);
        
        setTimeout(() => {
            setProgressBar(45);
            showLoading(true, "AIが音声を聴いて書き起こし中 (デモモード)...");
            
            setTimeout(() => {
                setProgressBar(75);
                showLoading(true, "決定事項とToDoを整理中 (デモモード)...");
                
                setTimeout(() => {
                    setProgressBar(100);
                    
                    const demoTranscript = 
                        "山田：それでは定例会議を始めます。本日の議題は、新しい測定スケジュール管理アプリの開発進捗と、今後のデプロイ計画についてです。まずは進捗からお願いします。\n" +
                        "鈴木：はい、フロントエンドの主要画面デザインはCSSでのスタイリング含め、ほぼ8割程度完成しています。ただ、スマホ対応でのマイク録音連携部分で、iOS Safariのみマイク入力がうまく取得できないバグが発見され、その対応に手こずっています。\n" +
                        "佐藤：iOSのSafariはWeb Audio APIの仕様が他ブラウザと少し異なっていて、ユーザーインタラクションの直後にAudioContextを開始しないとミュートされる制約があります。そこは私の方で過去に対応コードを書いたことがあるので、鈴木さんを手伝います。今日の午後、2人でコードレビューをしながら修正しましょう。\n" +
                        "鈴木：ありがとうございます！助かります。それが解決すれば、週明けの月曜日にはテスト環境にデプロイできる予定です。\n" +
                        "山田：了解しました。では、佐藤さんと鈴木さんでそのバグ修正をお願いします。デプロイ先はGitHub Pagesで問題ないですか？\n" +
                        "鈴木：はい、静的フロントエンドなのでGitHub Pagesでデプロイ可能です。ただ、APIキーをどう管理するかですね。各自がローカルストレージに入力するアプローチで進めます。\n" +
                        "山田：それで進めましょう。では、次回は来週水曜日に進捗確認を行います。他に議題はありますか？ なければこれで終わります。お疲れ様でした。";
                    
                    const demoSummary = 
                        "# 会議議事録：開発定例会 (デモ要約)\n\n" +
                        "## 1. 会議概要\n" +
                        "- **会議名**: 測定スケジュール管理アプリ開発定例会\n" +
                        "- **出席者**: 山田 (ファシリテーター), 鈴木 (開発担当), 佐藤 (技術サポート)\n\n" +
                        "## 2. 決定事項\n" +
                        "- **デプロイ方法**: 静的フロントエンドとして **GitHub Pages** にデプロイする。\n" +
                        "- **APIキー管理**: セキュリティ確保のため、利用者が自身のブラウザ（LocalStorage）にキーを入力するアプローチを採用する。\n\n" +
                        "## 3. 議題と主な議論\n" +
                        "### 議題A: アプリ開発進捗とバグ対応\n" +
                        "- **状況**: フロントエンド主要画面のデザインは8割完了。\n" +
                        "- **課題**: iOS Safariでマイク録音時に音声が取得できないバグが発生。\n" +
                        "- **解決策**: iOS特有の `AudioContext` の制約であるため、佐藤氏が鈴木氏と午後から共同でコードレビュー及び修正作業を行い、バグを解決する。\n\n" +
                        "## 4. アクションアイテム (ToDo)\n" +
                        "- [ ] iOS Safariマイクバグの修正 / 担当: 鈴木・佐藤 / 期限: 本日中\n" +
                        "- [ ] テスト環境へのデプロイ作業 / 担当: 鈴木 / 期限: 5月30日 (月)\n\n" +
                        "## 5. 次回予定\n" +
                        "- **次回ミーティング**: 来週水曜日";
                    
                    displayResults(demoTranscript, demoSummary);
                    showLoading(false);
                    
                }, 800);
            }, 800);
        }, 1000);
    }

    function buildPrompt(template, customIns) {
        let templateInstruction = "";
        
        switch (template) {
            case 'brainstorm':
                templateInstruction = 
                    "会議中に登場した「様々なアイデア」をカテゴリごとに漏れなく整理し、それぞれのメリット・デメリットを構造化してまとめてください。";
                break;
            case 'todo':
                templateInstruction = 
                    "会話から、「誰が」「いつまでに」「何をすべきか」というタスク（ToDo）を漏れなく抽出してリスト化してください。会話中で担当や期限が不明な箇所は、その旨を明記して整理してください。";
                break;
            case 'brief':
                templateInstruction = 
                    "会議の議論の要点と結論のみを、300文字程度の簡潔な要約文（箇条書き3点以内）でまとめてください。";
                break;
            case 'standard':
            default:
                templateInstruction = 
                    "会議の全体概要、決定された事項、各トピックの議論要約、今後のアクションアイテム（担当者・期限付きのToDo）を整理した、構造的で読みやすい議事録を作成してください。";
                break;
        }

        let customBlock = "";
        if (customIns) {
            customBlock = `\n【ユーザーからの特別追加指示】:\n${customIns}\n`;
        }

        return `
あなたは優秀なエグゼクティブアシスタントです。添付された音声ファイルを最初から最後まで注意深く聴いて、以下の「処理1」と「処理2」の両方を実行してください。

# 処理1: 音声の文字起こし
音声内で話されている日本語の会話内容を、一言句漏らさずに正確にテキスト化（文字起こし）してください。話者が聞き取れる場合は、できる限り「山田：〜〜」「鈴木：〜〜」のように話者を特定して記述してください。

# 処理2: 議事録の要約・構造化
文字起こしした内容を整理し、以下の指示に沿って議事録を作成してください。
指示内容：${templateInstruction}
${customBlock}

---

# 重要：出力フォーマットの厳守
あなたの回答は、システムプログラムによって自動的に「文字起こし」と「要約結果」に分解されて画面に表示されます。
そのため、必ず以下の【区切り記号】を正確に使用し、指定された枠の中にそれぞれのテキストを出力してください。余計な前置きや挨拶文は出力しないでください。

===TRANSCRIPT_START===
(ここには「処理1」の最初から保存される完全な文字起こしテキストのみを出力してください)
===TRANSCRIPT_END===

===SUMMARY_START===
(ここには「処理2」のMarkdown形式で要約された議事録テキストのみを出力してください。見出し、箇条書き、タスクリストなどを活用してください)
===SUMMARY_END===
`;
    }

    // Display Output
    function displayResults(transcript, summary) {
        if (!elements.summaryRendered) return;
        
        elements.summaryRendered.classList.remove('error-style-display');
        if (elements.summaryPlaceholder) elements.summaryPlaceholder.classList.add('hidden');
        elements.summaryRendered.classList.remove('hidden');
        
        if (elements.transcriptPlaceholder) elements.transcriptPlaceholder.classList.add('hidden');
        if (elements.transcriptRaw) {
            elements.transcriptRaw.classList.remove('hidden');
            elements.transcriptRaw.value = transcript;
        }

        try {
            if (window.marked && typeof window.marked.parse === 'function') {
                elements.summaryRendered.innerHTML = window.marked.parse(summary);
            } else {
                elements.summaryRendered.innerText = summary;
            }
        } catch (e) {
            elements.summaryRendered.innerText = summary;
        }

        if (elements.btnCopy) elements.btnCopy.disabled = false;
        if (elements.btnDownload) elements.btnDownload.disabled = false;
        if (elements.btnEmail) elements.btnEmail.disabled = false;
        
        if (elements.resultTabBtns && elements.resultTabBtns[0]) {
            elements.resultTabBtns[0].click();
        }
    }

    if (elements.btnCopy) {
        elements.btnCopy.addEventListener('click', () => {
            const activeTabEl = document.querySelector('.result-tab-btn.active');
            if (!activeTabEl) return;
            const activeTab = activeTabEl.getAttribute('data-result-tab');
            let textToCopy = "";
            
            if (activeTab === 'tab-summary') {
                textToCopy = elements.summaryRendered ? elements.summaryRendered.innerText : '';
            } else {
                textToCopy = elements.transcriptRaw ? elements.transcriptRaw.value : '';
            }

            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalText = elements.btnCopy.innerHTML;
                    elements.btnCopy.innerHTML = '<i data-lucide="check"></i> コピーしました';
                    safeCreateIcons();
                    setTimeout(() => {
                        elements.btnCopy.innerHTML = originalText;
                        safeCreateIcons();
                    }, 2000);
                })
                .catch(err => {
                    console.error("コピー失敗:", err);
                    alert("コピーに失敗しました。");
                });
        });
    }

    if (elements.btnDownload) {
        elements.btnDownload.addEventListener('click', () => {
            const activeTabEl = document.querySelector('.result-tab-btn.active');
            if (!activeTabEl) return;
            const activeTab = activeTabEl.getAttribute('data-result-tab');
            let textContent = "";
            let filename = "";

            if (activeTab === 'tab-summary') {
                textContent = elements.summaryRendered ? elements.summaryRendered.innerText : '';
                filename = `minutes_summary_${new Date().toISOString().slice(0,10)}.md`;
            } else {
                textContent = elements.transcriptRaw ? elements.transcriptRaw.value : '';
                filename = `transcript_${new Date().toISOString().slice(0,10)}.txt`;
            }

            try {
                // 文字化け防止のため、UTF-8のBOM(Byte Order Mark)を追加してファイル保存
                const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
                const blob = new Blob([bom, textContent], { type: "text/plain;charset=utf-8" });
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) {
                console.error("ダウンロード失敗:", e);
            }
        });
    }

    if (elements.btnEmail) {
        elements.btnEmail.addEventListener('click', () => {
            const activeTabEl = document.querySelector('.result-tab-btn.active');
            if (!activeTabEl) return;
            const activeTab = activeTabEl.getAttribute('data-result-tab');
            let textContent = "";
            let subjectTitle = "会議議事録";
            
            if (activeTab === 'tab-summary') {
                textContent = elements.summaryRendered ? elements.summaryRendered.innerText : '';
                subjectTitle = "【AI議事録】要約レポート";
            } else {
                textContent = elements.transcriptRaw ? elements.transcriptRaw.value : '';
                subjectTitle = "【AI議事録】文字起こし生テキスト";
            }

            try {
                // メール送信処理 (mailtoスキーム)
                const mailtoUrl = `mailto:?subject=${encodeURIComponent(subjectTitle)}&body=${encodeURIComponent(textContent)}`;
                window.location.href = mailtoUrl;
            } catch (e) {
                console.error("メール起動失敗:", e);
                alert("メールアプリの起動に失敗しました。お使いの端末に標準メールアプリが設定されているかご確認ください。");
            }
        });
    }

    // ---------------------------------------------------------
    // 10. Initialization
    // ---------------------------------------------------------
    try {
        loadSavedKeys();
        safeCreateIcons();
    } catch (initError) {
        console.error("アプリの初期化に失敗しました:", initError);
    }
});
