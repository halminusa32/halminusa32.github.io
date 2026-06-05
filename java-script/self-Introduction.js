function intro_typeWriter() {
  // 誕生日: 2011年5月23日
  const birthDate = new Date(2011, 4, 23); // 月は0から始まるので4月 = 5月
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  
  // 誕生日を過ぎていない場合は1歳引く
  if (today.getMonth() < birthDate.getMonth() || 
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
    age--;
  }

  const texts = [
    "名前: はるみん",
    `年齢: ${age}歳`,
    "好きなもの: 音ゲー"
  ];
  const target = document.getElementById("intro_typewriter");
  let textIndex = 0;
  let charIndex = 0;
  let htmlText = "";

  function typing() {
    if (textIndex < texts.length) {
      const currentText = texts[textIndex];
      if (charIndex < currentText.length) {
        htmlText += currentText.charAt(charIndex);
        target.textContent = htmlText;
        charIndex++;
        setTimeout(typing, 100);
      } else {
        htmlText += "\n";
        textIndex++;
        charIndex = 0;
        setTimeout(typing, 500);
      }
    }
  }

  typing();
}

document.addEventListener("DOMContentLoaded", () => {
  const target = document.getElementById("intro_typewriter");

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        intro_typeWriter();
        obs.unobserve(entry.target); // 一度だけ発動
      }
    });
  }, {
    threshold: 0.6 // 要素が60%以上見えたら発動
  });

  observer.observe(target);
});
