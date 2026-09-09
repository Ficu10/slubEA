(function(){
  const accessKey = 'wesele_quiz_access_v1';
  if (localStorage.getItem(accessKey) === 'granted') return;

  const questions = [
    { text: 'Jak Pan Młody ma na drugie imię?', answers: ['Piotr', 'Jan', 'Andrzej', 'Karol'], correct: 'Jan' },
    { text: 'Jak Panna Młoda ma na drugie imię?', answers: ['Anastazja', 'Paulina', 'Anna', 'Monika'], correct: 'Anna' },
    { text: 'Gdzie poznali się Państwo Młodzi?', answers: ['W klubie', 'Na koncercie', 'W sklepie', 'Na studiach'], correct: 'Na studiach' },
    { text: 'Gdzie będą mieszkać Państwo Młodzi?', answers: ['Katowice: Piotrowice', 'Katowice: Ochojec', 'Zabrze: Pawłów', 'Zabrze: Zaborze'], correct: 'Katowice: Piotrowice' },
    { text: 'Gdzie Państwo Młodzi polecą na podróż poślubną?', answers: ['Tajlandia', 'Australia', 'Malediwy', 'Hawaje'], correct: 'Malediwy' },
    { text: 'Jaki kolor ma łazienka Państwa Młodych?', answers: ['Szara', 'Czerwona', 'Żółta', 'Niebieska'], correct: 'Szara' },
    { text: 'Jaka jest różnica wieku między najstarszym a najmłodszym uczestnikiem wesela?', answers: ['92 lata', '97 lat', '89 lat', '100 lat'], correct: '97 lat' }
  ];

  const question = questions[Math.floor(Math.random() * questions.length)];
  const answers = question.answers.slice().sort(() => Math.random() - 0.5);
  const overlay = document.createElement('div');
  overlay.id = 'quizGate';
  overlay.innerHTML = '<div class="quiz-gate-card"><div class="quiz-gate-kicker">Witamy na stronie weselnej</div><h2>Odpowiedz na pytanie</h2><p class="quiz-gate-question"></p><div class="quiz-gate-answers"></div><p class="quiz-gate-message" role="alert"></p><button type="button" class="quiz-gate-submit">Odpowiedz</button></div>';

  const style = document.createElement('style');
  style.textContent = '#quizGate{position:fixed;inset:0;z-index:50000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(20,34,26,.68);font-family:Poppins,system-ui,sans-serif}#quizGate .quiz-gate-card{width:min(100%,480px);max-height:calc(100vh - 36px);overflow:auto;background:#fff;padding:clamp(20px,5vw,32px);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.24);color:#14221a}#quizGate h2{margin:0 0 14px;color:#2f6f4e;font-family:Merriweather,Georgia,serif}#quizGate .quiz-gate-kicker{margin-bottom:8px;color:#6b6b6b;font-size:13px;font-weight:600}#quizGate .quiz-gate-question{font-weight:600;line-height:1.45;margin:0 0 14px}.quiz-gate-answers{display:grid;gap:9px}.quiz-gate-answer{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid rgba(47,111,78,.2);border-radius:9px;cursor:pointer}.quiz-gate-answer:has(input:checked){background:#edf7ef;border-color:#2f6f4e}.quiz-gate-answer input{accent-color:#2f6f4e}.quiz-gate-submit{width:100%;margin-top:18px}.quiz-gate-message{min-height:22px;margin:12px 0 0;color:#b33;font-weight:600}.quiz-gate-submit:disabled{cursor:not-allowed;opacity:.65}@media(max-width:520px){#quizGate{padding:12px}#quizGate .quiz-gate-card{border-radius:12px;padding:20px}.quiz-gate-answer{padding:13px 11px}}';

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  const card = overlay.querySelector('.quiz-gate-card');
  card.querySelector('.quiz-gate-question').textContent = question.text;
  const answersBox = card.querySelector('.quiz-gate-answers');
  answers.forEach((answer, index)=>{
    const label = document.createElement('label');
    label.className = 'quiz-gate-answer';
    label.innerHTML = '<input type="radio" name="quiz-answer" value="' + index + '"><span></span>';
    label.querySelector('span').textContent = answer;
    answersBox.appendChild(label);
  });

  card.querySelector('.quiz-gate-submit').addEventListener('click', function(){
    const selected = card.querySelector('input[name="quiz-answer"]:checked');
    const message = card.querySelector('.quiz-gate-message');
    if (!selected){ message.textContent = 'Zaznacz odpowiedź.'; return; }
    const answer = answers[Number(selected.value)];
    if (answer !== question.correct){
      message.textContent = 'Nieprawidłowa odpowiedź. Odśwież stronę i spróbuj ponownie.';
      card.querySelectorAll('input').forEach(input=>{ input.disabled = true; });
      this.disabled = true;
      return;
    }
    localStorage.setItem(accessKey, 'granted');
    overlay.remove();
    style.remove();
  });
})();
