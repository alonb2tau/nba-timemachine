/*
 * trivia.js — a one-question bonus round between the draft and the Team
 * Hub: pick a difficulty tier, answer one NBA trivia question, and — only
 * if you're right — bank a small, permanent team-strength bonus for the
 * season. The reward is regulated by how hard a question you were willing
 * to risk: a bigger bonus for a harder question, nothing extra for a wrong
 * answer at any tier.
 */

const TRIVIA_TIERS = {
  easy:   { label: "Warm-Up",           srsBonus: 0.6, blurb: "A layup for any fan." },
  medium: { label: "Scouting Report",   srsBonus: 1.4, blurb: "You'll need to know your ball." },
  hard:   { label: "Front-Office Intel", srsBonus: 2.6, blurb: "Deep-cut territory — big reward if you nail it." },
};

const TRIVIA_BANK = {
  easy: [
    { q: "Who is the NBA's all-time leading scorer?", options: ["LeBron James", "Kareem Abdul-Jabbar", "Kobe Bryant", "Karl Malone"], correct: 0 },
    { q: "How many players from each team are on the court at once?", options: ["5", "6", "4", "7"], correct: 0 },
    { q: "The Lakers are based in which city?", options: ["Los Angeles", "San Francisco", "Sacramento", "San Diego"], correct: 0 },
    { q: "How many points is a shot from beyond the three-point arc worth?", options: ["3", "2", "4", "1"], correct: 0 },
    { q: "Which franchise has won the most NBA championships in history?", options: ["Boston Celtics", "Los Angeles Lakers", "Chicago Bulls", "San Antonio Spurs"], correct: 0 },
    { q: "How many quarters make up a regulation NBA game?", options: ["4", "2", "3", "5"], correct: 0 },
  ],
  medium: [
    { q: "Which team set the NBA record with a 73-9 regular season in 2015-16?", options: ["Golden State Warriors", "Chicago Bulls", "San Antonio Spurs", "Houston Rockets"], correct: 0 },
    { q: "Who scored an NBA-record 100 points in a single game in 1962?", options: ["Wilt Chamberlain", "Kareem Abdul-Jabbar", "Michael Jordan", "Kobe Bryant"], correct: 0 },
    { q: "Which NBA legend is nicknamed \"The Black Mamba\"?", options: ["Kobe Bryant", "Allen Iverson", "Tracy McGrady", "Vince Carter"], correct: 0 },
    { q: "How many total minutes are played in a regulation NBA game?", options: ["48", "40", "44", "52"], correct: 0 },
    { q: "Which team drafted Michael Jordan in 1984?", options: ["Chicago Bulls", "Portland Trail Blazers", "Houston Rockets", "Philadelphia 76ers"], correct: 0 },
    { q: "Who holds the NBA's all-time career assists record?", options: ["John Stockton", "Magic Johnson", "Chris Paul", "Jason Kidd"], correct: 0 },
  ],
  hard: [
    { q: "Who won Finals MVP the year the Toronto Raptors won their only championship (2019)?", options: ["Kawhi Leonard", "Kyle Lowry", "Pascal Siakam", "Fred VanVleet"], correct: 0 },
    { q: "Kevin Durant joined which team in 2016 free agency, after they'd eliminated his team in the playoffs?", options: ["Golden State Warriors", "Cleveland Cavaliers", "San Antonio Spurs", "Boston Celtics"], correct: 0 },
    { q: "Who was the first overall pick of the famously stacked 2003 NBA Draft?", options: ["LeBron James", "Carmelo Anthony", "Dwyane Wade", "Chris Bosh"], correct: 0 },
    { q: "Michael Jordan's iconic series-winning shot over Craig Ehlo in 1989 is remembered as what?", options: ["\"The Shot\"", "\"The Flu Game\"", "\"The Shrug\"", "\"The Last Dance\""], correct: 0 },
    { q: "Who passed Oscar Robertson to become the NBA's all-time career triple-doubles leader?", options: ["Russell Westbrook", "James Harden", "LeBron James", "Magic Johnson"], correct: 0 },
    { q: "Dirk Nowitzki played his entire 21-year career with which franchise?", options: ["Dallas Mavericks", "San Antonio Spurs", "Houston Rockets", "Phoenix Suns"], correct: 0 },
  ],
};

function triviaShuffledOptions(item) {
  const withFlag = item.options.map((text, i) => ({ text, isCorrect: i === item.correct }));
  for (let i = withFlag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withFlag[i], withFlag[j]] = [withFlag[j], withFlag[i]];
  }
  return withFlag;
}

function initTrivia() {
  $("trivia-question").classList.add("hidden");
  $("trivia-result").classList.add("hidden");
  $("trivia-intro").classList.remove("hidden");
  $("trivia-tier-options").innerHTML = Object.entries(TRIVIA_TIERS).map(([key, t]) => `
    <button class="trivia-tier-card" data-tier="${key}">
      <div class="trivia-tier-name">${esc(t.label)}</div>
      <div class="trivia-tier-blurb">${esc(t.blurb)}</div>
      <div class="trivia-tier-reward">+${t.srsBonus.toFixed(1)} SRS if correct</div>
    </button>`).join("");
  $("trivia-tier-options").querySelectorAll(".trivia-tier-card").forEach(btn =>
    btn.addEventListener("click", () => startTriviaQuestion(btn.dataset.tier)));
  $("trivia-skip-btn").onclick = () => finishTrivia(null, false);
}

function startTriviaQuestion(tier) {
  const bank = TRIVIA_BANK[tier];
  const item = bank[Math.floor(Math.random() * bank.length)];

  $("trivia-intro").classList.add("hidden");
  $("trivia-result").classList.add("hidden");
  $("trivia-question").classList.remove("hidden");
  $("trivia-question-tier").textContent = `${TRIVIA_TIERS[tier].label} — +${TRIVIA_TIERS[tier].srsBonus.toFixed(1)} SRS if correct`;
  $("trivia-question-text").textContent = item.q;

  const opts = triviaShuffledOptions(item);
  $("trivia-answers").innerHTML = opts.map((o, i) =>
    `<button class="trivia-answer-btn" data-idx="${i}">${esc(o.text)}</button>`).join("");
  $("trivia-answers").querySelectorAll(".trivia-answer-btn").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      const correct = opts[i].isCorrect;
      $("trivia-answers").querySelectorAll("button").forEach((b, bi) => {
        b.disabled = true;
        if (opts[bi].isCorrect) b.classList.add("correct");
        else if (bi === i) b.classList.add("wrong");
      });
      setTimeout(() => finishTrivia(tier, correct), 900);
    });
  });
}

function finishTrivia(tier, correct) {
  const bonus = (tier && correct) ? TRIVIA_TIERS[tier].srsBonus : 0;
  HUB.triviaBonus = bonus;
  HUB.triviaTier = (tier && correct) ? tier : null;

  $("trivia-question").classList.add("hidden");
  $("trivia-intro").classList.add("hidden");
  $("trivia-result").classList.remove("hidden");

  if (!tier) {
    $("trivia-result-headline").textContent = "Skipped";
    $("trivia-result-headline").className = "trivia-result-headline skipped";
    $("trivia-result-sub").textContent = "No bonus this time — straight to the Team Hub.";
  } else if (correct) {
    $("trivia-result-headline").textContent = `Correct! +${bonus.toFixed(1)} SRS banked`;
    $("trivia-result-headline").className = "trivia-result-headline made";
    $("trivia-result-sub").textContent = `The ${TRIVIA_TIERS[tier].label} bonus is applied for the rest of the season.`;
  } else {
    $("trivia-result-headline").textContent = "Not quite";
    $("trivia-result-headline").className = "trivia-result-headline missed";
    $("trivia-result-sub").textContent = "No bonus this time — on to the Team Hub.";
  }

  $("trivia-continue-btn").onclick = () => {
    renderHub();
    switchPhase("hub");
  };
}
