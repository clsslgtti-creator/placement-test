// Speaking test JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const restartBtn = document.getElementById('restartBtn');
    const testArea = document.getElementById('testArea');
    const controls = document.getElementById('controls');
    const promptTable = document.getElementById('prompt-table');
    const qIndexEl = document.getElementById('qIndex');
    const qTotalEl = document.getElementById('qTotal');
    const promptTitle = document.getElementById('promptTitle');
    const nowPlaying = document.getElementById('nowPlaying');
    const recStatus = document.getElementById('recStatus');
    const scoreText = document.getElementById('scoreText');
    const detailsEl = document.getElementById('details');
    const answerTimeInput = document.getElementById('answerTime');

    // Table cells (filled from selected set's answers for context)
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const synth = window.speechSynthesis;

    let questions = [];
    let results = [];
    let current = 0;
    let recognition = null;
    let countdownInterval = null;
    let speechTimeout = null;

    async function loadQuestions() {
        const res = await fetch('questions.json', { cache: 'no-cache' });
        const data = await res.json();
        // Randomly pick one set
        const sets = [data.question_set_1, data.question_set_2];
        const picked = Math.random() < 0.5 ? sets[0] : sets[1];
        // Build table from picked.table
        buildContextTable(picked.table || []);
        // Extract questions
        const qArr = picked.question || [];
        questions = qArr.map(q => ({
            ...q,
            acceptableAnswers: (q.answers || q.ansswer || []).map(a => normalize(a))
        }));
        qTotalEl.textContent = questions.length.toString();
    }

    function buildContextTable(rows) {
        // Create header row from headings in order
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        if (!rows || rows.length === 0) return;
        const trHead = document.createElement('tr');
        rows.forEach(r => {
            const th = document.createElement('th');
            th.textContent = r.heading || '';
            trHead.appendChild(th);
        });
        tableHead.appendChild(trHead);

        const trBody = document.createElement('tr');
        rows.forEach(r => {
            const td = document.createElement('td');
            td.textContent = r.data || '';
            trBody.appendChild(td);
        });
        tableBody.appendChild(trBody);
    }

    function normalize(s) {
        return (s || '')
            .toLowerCase()
            .replace(/[.,!?]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function speakText(text) {
        if (!synth) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1;
        utter.pitch = 1;
        utter.lang = 'en-US';
        synth.cancel();
        synth.speak(utter);
        return new Promise(resolve => {
            utter.onend = resolve;
            utter.onerror = resolve;
        });
    }

    async function playQuestion(q) {
        nowPlaying.textContent = 'Playing question...';
        // Try provided audio; if not available, use TTS
        if (q.question_audio) {
            try {
                await playAudio(q.question_audio);
                return;
            } catch (e) {
                // fallback to TTS
            }
        }
        await speakText(q.question_text);
    }

    function playAudio(src) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(src);
            audio.onended = resolve;
            audio.onerror = reject;
            audio.play().catch(reject);
        });
    }

    function startRecognition(timeoutMs) {
        return new Promise((resolve) => {
            if (!SpeechRecognition) {
                resolve({ transcript: '', error: 'no-sr' });
                return;
            }
            recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            let finalTranscript = '';
            let finished = false;
            let hasSpeech = false;

            const finish = (data) => {
                if (finished) return;
                finished = true;
                try { recognition.stop(); } catch (_) {}
                if (speechTimeout) clearTimeout(speechTimeout);
                resolve(data);
            };

            recognition.onresult = (event) => {
                const t = event.results[0][0].transcript || '';
                finalTranscript = t;
                hasSpeech = true;
                
                // If we captured speech, wait 3 seconds before moving to next
                if (t.trim() && !speechTimeout) {
                    speechTimeout = setTimeout(() => {
                        finish({ transcript: finalTranscript });
                    }, 3000);
                }
            };
            recognition.onerror = () => finish({ transcript: finalTranscript, error: 'sr-error' });
            recognition.onend = () => {
                if (!hasSpeech) {
                    finish({ transcript: finalTranscript });
                }
            };

            recognition.start();

            // Manual timeout (only used when a timeout is passed)
            if (timeoutMs) {
                setTimeout(() => finish({ transcript: finalTranscript, error: 'timeout' }), timeoutMs);
            }
        });
    }

    // Passive recognition: no explicit timer – lets Web Speech end naturally on silence
    function startRecognitionPassive() {
        return new Promise((resolve) => {
            if (!SpeechRecognition) {
                resolve({ transcript: '', error: 'no-sr' });
                return;
            }
            recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recognition.continuous = false;

            let finalTranscript = '';
            let finished = false;

            const finish = (data) => {
                if (finished) return;
                finished = true;
                try { recognition.stop(); } catch (_) {}
                resolve(data);
            };

            recognition.onresult = (event) => {
                finalTranscript = event.results[0][0].transcript || '';
            };
            recognition.onerror = () => finish({ transcript: finalTranscript, error: 'sr-error' });
            recognition.onend = () => finish({ transcript: finalTranscript });

            recognition.start();
        });
    }

    async function runTest() {
        results = [];
        current = 0;
        controls.style.display = 'none';
        promptTable.style.display = 'block';
        // Ensure instruction under table is visible
        const tableInstruction = document.getElementById('tableInstruction');
        if (tableInstruction) {
            tableInstruction.style.display = 'block';
        }
        testArea.style.display = 'block';
        document.getElementById('results').style.display = 'none';

        // 15-second countdown for students to read the table
        const totalReading = 15;
        promptTitle.textContent = `Test starts in ${totalReading} seconds`;
        nowPlaying.textContent = 'Read the table carefully.';
        recStatus.textContent = 'Preparing...';

        await startCountdown(totalReading, (remain) => {
            promptTitle.textContent = `Test starts in ${remain} seconds`;
            nowPlaying.textContent = 'Read the table carefully.';
        });
        
        // Reset display for actual questions
        qTotalEl.textContent = questions.length.toString();
        
        for (let i = 0; i < questions.length; i++) {
            current = i;
            promptTitle.textContent = `Question ${i + 1} of ${questions.length}`;
            qIndexEl.textContent = (i + 1).toString();
            qTotalEl.textContent = questions.length.toString();
            const q = questions[i];
            await playQuestion(q);
            // Prepare UI for answer phase (no timers)
            nowPlaying.textContent = 'Answer now...';
            recStatus.textContent = 'Listening...';
            speechTimeout = null;

            const sr = await startRecognitionPassive();
            recStatus.textContent = 'Processing...';

            const userSaid = normalize(sr.transcript);
            const correct = q.acceptableAnswers.includes(userSaid);
            results.push({ id: q.id, question: q.question_text, user: sr.transcript || '', correct });

            await sleep(400);
        }

        showResults();
    }

    function startCountdown(seconds, onTick) {
        clearInterval(countdownInterval);
        let remain = seconds;
        return new Promise((resolve) => {
            countdownInterval = setInterval(() => {
                remain -= 1;
                const val = Math.max(0, remain);
                if (typeof onTick === 'function') {
                    try { onTick(val); } catch (_) {}
                }
                if (remain <= 0) {
                    clearInterval(countdownInterval);
                    resolve();
                }
            }, 1000);
        });
    }

    function showResults() {
        testArea.style.display = 'none';
        document.getElementById('results').style.display = 'block';
        controls.style.display = 'block';
        const score = results.filter(r => r.correct).length;
        scoreText.textContent = `Score: ${score} / ${questions.length} (${score * 3} marks)`;
        detailsEl.innerHTML = results.map(r => {
            const status = r.correct ? '✅' : '❌';
            return `<div class="result-row">${status} ${escapeHtml(r.question)}<br/><small>Your answer: ${escapeHtml(r.user)}</small></div>`;
        }).join('');
    }

    function escapeHtml(s) {
        return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
    }

    function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

    async function warmUpSpeech() {
        try {
            // Ask for mic permission early to avoid first-time delay
            if (navigator.mediaDevices?.getUserMedia) {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            if (SpeechRecognition) {
                const quick = new SpeechRecognition();
                quick.lang = 'en-US';
                quick.onresult = () => {};
                quick.onerror = () => {};
                quick.start();
                setTimeout(() => { try { quick.stop(); } catch (_) {} }, 200);
            }
        } catch (_) {
            // ignore; permissions may be declined
        }
    }

    startBtn?.addEventListener('click', async () => {
        await warmUpSpeech();
        await loadQuestions();
        await runTest();
    });

    restartBtn?.addEventListener('click', () => {
        window.location.reload();
    });
});
