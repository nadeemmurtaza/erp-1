(function () {
  'use strict';

  // ---------- Config / placeholders ----------
  // Fill these in before launch.
  var WHATSAPP_NUMBER = '923709861100';
  var CONTACT_EMAIL = '[EMAIL]';

  var IMG = {
    gradCap: 'images/graduation-cap.jpg',
    gradSit: 'images/graduation-seated.jpg',
    gradField: 'images/graduation-lawn.jpg',
    haven: 'images/brand-led-sign.jpg',
    astro: 'images/event-telescope.jpg',
    bricks: 'images/onset-bricks.jpg',
    street: 'images/onset-street.jpg',
    studio: 'images/studio-lighting.jpg'
  };

  var ALL_FRAMES = [
    { title: 'Class of 2025', cat: 'Graduation', img: IMG.gradCap, alt: 'Graduate saluting in cap and gown', meta: 'Graduation portraits · LCWU' },
    { title: 'Havenwear drop', cat: 'Brands', img: IMG.haven, alt: 'Model under an LED sign', meta: 'Brand reel · Havenwear.pk' },
    { title: 'On set, b/w', cat: 'On set', img: IMG.bricks, alt: 'Black and white performer bending over bricks', meta: 'Short film BTS' },
    { title: 'Astronomy night', cat: 'Events', img: IMG.astro, alt: 'Guest looking through a telescope', meta: 'Event · Lahore Astronomical Society' },
    { title: 'Seated, LCWU', cat: 'Graduation', img: IMG.gradSit, alt: 'Graduate seated on grass', meta: 'Graduation portraits · LCWU' },
    { title: 'Street, on set', cat: 'On set', img: IMG.street, alt: 'Street scene with a decorated horse carriage', meta: 'Film BTS · [Production]' },
    { title: 'Shoot day', cat: 'Brands', img: IMG.studio, alt: 'Studio lighting set up', meta: 'Studio BTS · [Client]' },
    { title: 'Green lawn', cat: 'Graduation', img: IMG.gradField, alt: 'Graduate on a lawn tucking a flower behind her ear', meta: 'Graduation portraits · LCWU' }
  ];
  var CATS = ['All', 'Graduation', 'Brands', 'Events', 'On set'];
  var SHOOT_OPTS = ['Graduation shoot', 'Portrait session', 'Brand content or reel', 'Event', 'Short film or BTS'];
  var NEED_OPTS = ['Photo', 'Film', 'Photo and film', 'Not sure yet'];
  var SECTIONS = [
    ['hero', 'Start'], ['work', 'Contact sheet'], ['films', 'Films'],
    ['words', 'Kind words'], ['services', 'Services'], ['book', 'Book']
  ];

  // ---------- Small utilities ----------
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var cl01 = function (v) { return clamp(v, 0, 1); };
  var round3 = function (v) { return Math.round(v * 1000) / 1000; };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var $ = function (id) { return document.getElementById(id); };
  var isMobile = function () { return window.matchMedia('(max-width: 760px)').matches; };
  var finePointer = function () { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; };
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = { reduced: prefersReduced, cat: 'All', shoot: 0, need: 0, date: '', sent: false };

  if (state.reduced) document.body.classList.add('reduced-motion');

  // ---------- Intro ----------
  function runIntro() {
    var intro = $('intro');
    if (state.reduced) { intro.classList.add('skip'); return; }
    intro.classList.add('running');
    var finish = function () {
      if (intro.classList.contains('closing') || intro.classList.contains('skip')) return;
      intro.classList.add('closing');
      setTimeout(function () { intro.classList.add('skip'); }, 820);
    };
    intro.addEventListener('click', finish);
    setTimeout(finish, 1100);
  }

  // ---------- Hero title letters ----------
  function letters(str, root) {
    root.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      var span = document.createElement('span');
      span.className = 'ltr';
      span.textContent = c === ' ' ? ' ' : c;
      span.style.animationDelay = (state.reduced ? 0 : (i * 40)) + 'ms';
      frag.appendChild(span);
    }
    root.appendChild(frag);
  }

  function initHeroTitle() {
    letters('Zu with', $('hero-line-1'));
    letters('camera', $('hero-line-2'));
    var delay = state.reduced ? 0 : 1300;
    setTimeout(function () {
      $('hero-line-1').classList.add('in');
      $('hero-line-2').classList.add('in');
    }, delay);
  }

  // ---------- Hero photo stack (desktop) / deck (mobile) ----------
  var deckIndex = 0;
  var deckTouched = false;
  var deckEl = $('hero-deck');
  var deckSlots = [];

  function buildDeck() {
    deckEl.innerHTML = '';
    deckSlots = ALL_FRAMES.map(function (f) {
      var img = document.createElement('img');
      img.src = f.img;
      img.alt = f.alt;
      img.className = 'dk-img';
      img.style.position = 'absolute';
      img.style.left = '50%';
      img.style.top = '20px';
      img.style.width = '250px';
      img.style.height = '330px';
      img.style.marginLeft = '-125px';
      img.style.borderRadius = '4px';
      img.style.objectFit = 'cover';
      img.style.boxShadow = '0 18px 40px rgba(20,19,17,.18)';
      img.style.transition = 'transform 650ms ' + 'cubic-bezier(.16,1,.3,1)' + ', opacity 450ms';
      deckEl.appendChild(img);
      return img;
    });
    renderDeck();
  }

  function renderDeck() {
    var n = deckSlots.length;
    var layout = { 0: { t: 'translate(-50%, 0) rotate(-2deg)', o: 1, z: 10 }, 1: { t: 'translate(-50%, 10px) rotate(4deg)', o: 1, z: 9 }, 2: { t: 'translate(-50%, 18px) rotate(-6deg)', o: 1, z: 8 } };
    deckSlots.forEach(function (img, i) {
      var pos = (i - deckIndex + n) % n;
      var sl = layout[pos] || { t: 'translate(-50%, 24px) rotate(0deg)', o: 0, z: 1 };
      img.style.transform = sl.t;
      img.style.opacity = sl.o;
      img.style.zIndex = sl.z;
    });
  }

  function initHeroDeck() {
    buildDeck();
    deckEl.addEventListener('click', function () { deckTouched = true; deckIndex = (deckIndex + 1) % deckSlots.length; renderDeck(); });
    deckEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); deckEl.click(); } });
    if (!state.reduced) {
      setInterval(function () {
        if (deckTouched || !isMobile() || document.hidden) return;
        deckIndex = (deckIndex + 1) % deckSlots.length;
        renderDeck();
      }, 3200);
    }
  }

  // ---------- Cursor trail (desktop hero) ----------
  var trailPool = [];
  var trailK = 0;
  var trailGen = [false, false, false, false, false, false, false];

  function initCursorTrail() {
    var host = $('cursor-trail');
    for (var i = 0; i < 7; i++) {
      var img = document.createElement('img');
      img.className = 'trail-item';
      img.alt = '';
      host.appendChild(img);
      trailPool.push(img);
    }
    var hero = $('hero');
    var lastX = null, lastY = null;
    hero.addEventListener('mousemove', function (e) {
      if (state.reduced || !finePointer()) return;
      var r = hero.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (lastX != null && Math.hypot(x - lastX, y - lastY) < 110) return;
      lastX = x; lastY = y;
      var slot = trailK % 7;
      trailGen[slot] = !trailGen[slot];
      trailK++;
      var img = trailPool[slot];
      var frameImg = ALL_FRAMES[trailK % ALL_FRAMES.length].img;
      var rot = ((trailK * 37) % 17) - 8;
      img.src = frameImg;
      img.style.transition = 'none';
      img.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(.55)';
      img.style.opacity = '0';
      requestAnimationFrame(function () {
        img.style.transition = 'transform 1.3s cubic-bezier(.16,1,.3,1), opacity 1.3s cubic-bezier(.16,1,.3,1)';
        img.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(1)';
        img.style.opacity = '1';
        setTimeout(function () {
          img.style.opacity = '0';
          img.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(.9)';
        }, 900);
      });
    });
  }

  // ---------- Custom cursor + magnetic buttons ----------
  function initCursor() {
    var cursor = $('cursor'), label = $('cursor-label');
    if (!finePointer()) return;
    var moved = false;
    document.addEventListener('mousemove', function (e) {
      moved = true;
      cursor.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
      cursor.classList.add('on');
    });
    document.addEventListener('mouseleave', function () { cursor.classList.remove('on'); });
    document.querySelectorAll('[data-cursor]').forEach(function (el) {
      el.addEventListener('mouseenter', function () { label.textContent = el.getAttribute('data-cursor'); cursor.classList.add('label'); });
      el.addEventListener('mouseleave', function () { cursor.classList.remove('label'); label.textContent = ''; });
    });
  }

  function initMagnetic() {
    if (!finePointer()) return;
    document.querySelectorAll('.mag').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        if (state.reduced) return;
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = 'translate(' + round3(x) + 'px,' + round3(y) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = 'translate(0px,0px)'; });
    });
  }

  // ---------- Marquee ----------
  var mqVel = 0, mqPos = 0, mqDir = 1, lastScrollY = null;

  function tickMarquee() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var dy = lastScrollY == null ? 0 : y - lastScrollY;
    lastScrollY = y;
    mqVel = mqVel * 0.86 + dy * 0.14;
    if (dy > 0.5) mqDir = 1; else if (dy < -0.5) mqDir = -1;
    if (!state.reduced) mqPos += (0.7 + Math.min(Math.abs(mqVel), 80) * 0.14) * mqDir;
    [['mq-1', 1], ['mq-2', -1]].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var half = el.scrollWidth / 2 || 1;
      var v = pair[1] * (pair[0] === 'mq-2' ? mqPos * 0.8 : mqPos);
      var x = -(((v % half) + half) % half);
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    });
    var title = $('hero-title');
    if (title) {
      var sk = state.reduced ? 0 : clamp(-mqVel * 0.22, -9, 9);
      title.style.transform = 'skewY(' + (sk * 0.35).toFixed(2) + 'deg)';
    }
  }

  // ---------- Reel progress nav ----------
  function initReel() {
    var marksHost = $('reel-marks');
    SECTIONS.forEach(function (s) {
      var a = document.createElement('a');
      a.href = '#' + s[0];
      a.id = 'mark-' + s[0];
      a.innerHTML = '<i></i><span class="mono">' + s[1] + '</span>';
      marksHost.appendChild(a);
    });
  }

  function updateReel() {
    var doc = document.documentElement;
    var total = Math.max(1, doc.scrollHeight - window.innerHeight);
    var off = window.pageYOffset || doc.scrollTop;
    $('reel-fill').style.width = round3(Math.min(100, (off / total) * 100)) + '%';
    var marks = SECTIONS.map(function (s) {
      var el = $(s[0]);
      var at = el ? el.offsetTop : 0;
      return { id: s[0], at: at };
    });
    marks.forEach(function (m, i) {
      var next = marks[i + 1];
      var on = off + 2 >= m.at && (!next || off + 2 < next.at);
      var a = $('mark-' + m.id);
      if (!a) return;
      a.classList.toggle('on', on);
      a.style.left = round3(Math.min(100, (m.at / total) * 100)) + '%';
    });
    $('frame-counter').textContent = 'Frame ' + pad2(Math.floor(off / 40) % 100) + pad2(Math.floor(off / 4) % 100) + ' · Photo & film · Lahore';
  }

  // ---------- Contact sheet ----------
  var stripTrack = $('strip-track');
  var frameEls = [];

  function renderChips() {
    var host = $('filter-chips');
    host.innerHTML = '';
    CATS.forEach(function (c) {
      var n = c === 'All' ? ALL_FRAMES.length : ALL_FRAMES.filter(function (f) { return f.cat === c; }).length;
      var btn = document.createElement('button');
      btn.className = 'chip';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', c === state.cat ? 'true' : 'false');
      btn.innerHTML = c + ' <span class="chip-count mono">' + n + '</span>';
      btn.addEventListener('click', function () {
        state.cat = c;
        renderChips();
        buildStrip(true);
        if (isMobile()) { document.querySelector('.strip-viewport').scrollLeft = 0; }
      });
      host.appendChild(btn);
    });
  }

  function filteredFrames() {
    return state.cat === 'All' ? ALL_FRAMES : ALL_FRAMES.filter(function (f) { return f.cat === state.cat; });
  }

  function buildStrip(animate) {
    var list = filteredFrames();
    stripTrack.innerHTML = '';
    frameEls = list.map(function (f, i) {
      var gi = ALL_FRAMES.indexOf(f);
      var wrap = document.createElement('div');
      wrap.className = 'frame-wrap';
      wrap.style.transitionDelay = (i * 60) + 'ms';
      var btn = document.createElement('button');
      btn.className = 'frame-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Open ' + f.title);
      btn.setAttribute('data-cursor', 'Open');
      btn.innerHTML =
        '<img src="' + f.img + '" alt="' + f.alt + '">' +
        '<div class="frame-meta"><span class="mono">' + pad2(gi + 1) + ' · ' + f.cat + '</span>' +
        '<span class="mono frame-title">' + f.title + '</span></div>';
      btn.addEventListener('click', function (e) { openLightbox(gi, btn); });
      wrap.appendChild(btn);
      stripTrack.appendChild(wrap);
      return { wrap: wrap, btn: btn };
    });
    $('work-count').textContent = 'Frame 01 / ' + pad2(list.length) + ' · click to open';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        frameEls.forEach(function (fe) { fe.wrap.classList.add('in'); });
      });
    });
    measureWork();
  }

  function measureWork() {
    if (isMobile()) {
      document.getElementById('work').style.minHeight = '';
      return;
    }
    var pin = document.querySelector('.work-pin');
    var pinH = pin.getBoundingClientRect().height || 700;
    var vw = window.innerWidth;
    var trackW = stripTrack.scrollWidth;
    var over = Math.max(0, trackW - vw);
    document.getElementById('work').style.minHeight = (pinH + (over > 0 ? over * 1.5 : 0)) + 'px';
    stripTrack.parentElement.style.justifyContent = over > 0 ? '' : 'center';
  }

  function updateWork() {
    if (isMobile()) return;
    var workEl = document.getElementById('work');
    var pin = document.querySelector('.work-pin');
    var rect = workEl.getBoundingClientRect();
    var pinH = pin.getBoundingClientRect().height || 700;
    var over = rect.height - pinH;
    var p = over > 2 ? cl01(-rect.top / over) : 0;
    var vw = window.innerWidth;
    var trackW = stripTrack.scrollWidth;
    var overflow = Math.max(0, trackW - vw);
    var shift = overflow > 0 ? p * overflow : 0;
    stripTrack.style.transform = 'translate3d(' + round3(-shift) + 'px,0,0)';
    var center = vw / 2;
    var best = 1e9, nearest = 0;
    frameEls.forEach(function (fe, i) {
      var r = fe.btn.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var d = (cx - center) / vw;
      if (Math.abs(d) < best) { best = Math.abs(d); nearest = i; }
      var close = overflow > 0 ? 1 - Math.min(Math.abs(d) * 1.7, 1) : 1;
      fe.btn.style.transform = 'scale(' + round3(0.88 + 0.12 * close) + ') rotate(' + (overflow > 0 ? round3(d * 4) : 0) + 'deg)';
      fe.btn.querySelector('img').style.filter = 'grayscale(' + round3(1 - close) + ')';
    });
    $('work-count').textContent = 'Frame ' + pad2(nearest + 1) + ' / ' + pad2(frameEls.length) + ' · click to open';
  }

  // ---------- Films ----------
  var filmPlaying = false;

  function updateFilms() {
    var sec = $('films');
    var pin = sec.querySelector('.films-pin');
    var rect = sec.getBoundingClientRect();
    var pinH = pin.getBoundingClientRect().height || window.innerHeight;
    var extra = isMobile() ? Math.round(window.innerHeight * 0.85) : Math.round(window.innerHeight * 1.2);
    sec.style.minHeight = (pinH + extra) + 'px';
    var over = rect.height - pinH;
    var fp = over > 2 ? cl01(-rect.top / over) : (over <= 0 ? 1 : 0);
    var ghost = $('films-ghost');
    var ghostRange = isMobile() ? 900 : 1600;
    ghost.style.transform = 'translate3d(' + round3((isMobile() ? 100 : 200) - fp * ghostRange) + 'px,-50%,0)';
    var play = $('film-play');
    var clipPct = round3((1 - fp) * (isMobile() ? 12 : 16));
    var clipPct2 = round3((1 - fp) * (isMobile() ? 14 : 20));
    if (!filmPlaying) play.style.clipPath = 'inset(' + clipPct + '% ' + clipPct2 + '% round ' + round3(4 + (1 - fp) * 10) + 'px)';
    $('film-img').style.transform = 'scale(' + round3(1.2 - 0.2 * fp) + ')';
    $('film-link').classList.toggle('show', fp > 0.7 || over <= 0);
  }

  function initFilms() {
    var play = $('film-play');
    play.addEventListener('click', function () {
      filmPlaying = !filmPlaying;
      play.classList.toggle('open', filmPlaying);
      play.setAttribute('aria-pressed', filmPlaying ? 'true' : 'false');
      play.setAttribute('aria-label', filmPlaying ? 'Pause showreel' : 'Play showreel');
      $('film-play-icon').hidden = filmPlaying;
      $('film-now').hidden = !filmPlaying;
      $('film-progress').classList.toggle('running', filmPlaying);
      if (filmPlaying) play.style.clipPath = 'inset(0% 0% round 4px)';
    });
  }

  // ---------- Quote ----------
  function initQuote() {
    var text = 'Someone just captured the best angles of me. I will reach out to you every time.';
    var words = text.split(' ');
    var host = $('quote-text');
    host.innerHTML = words.map(function (w) { return '<span>' + w + ' </span>'; }).join('');
    quoteSpans = Array.prototype.slice.call(host.querySelectorAll('span'));
  }
  var quoteSpans = [];

  function updateQuote() {
    var sec = $('words');
    var rect = sec.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = state.reduced ? 1 : cl01((vh * 0.9 - rect.top) / Math.max(1, vh * 0.55));
    quoteSpans.forEach(function (span, i) {
      span.style.opacity = round3(0.14 + 0.86 * cl01(p * quoteSpans.length * 1.15 - i));
    });
  }

  // ---------- Services cards ----------
  function updateCards() {
    var c0 = $('card-0'), c1 = $('card-1'), c2 = $('card-2');
    if (state.reduced) { c0.style.filter = ''; c1.style.filter = ''; return; }
    var r1 = c1.getBoundingClientRect(), r2 = c2.getBoundingClientRect();
    var top0 = parseFloat(getComputedStyle(c0).top) || 0;
    var top1 = parseFloat(getComputedStyle(c1).top) || 0;
    var p0 = cl01(1 - (r1.top - top0) / 460);
    var p1 = cl01(1 - (r2.top - top1) / 460);
    c0.style.transform = 'scale(' + round3(1 - 0.05 * p0) + ')';
    c0.style.filter = 'brightness(' + round3(1 - 0.25 * p0) + ')';
    c1.style.transform = 'scale(' + round3(1 - 0.05 * p1) + ')';
    c1.style.filter = 'brightness(' + round3(1 - 0.25 * p1) + ')';
  }

  // ---------- About ----------
  function wordSpans(str, root) {
    root.innerHTML = '';
    var words = str.split(' ');
    var k = 0;
    words.forEach(function (w, wi) {
      var wrap = document.createElement('span');
      wrap.className = 'about-word';
      for (var i = 0; i < w.length; i++) {
        var l = document.createElement('span');
        l.className = 'about-letter';
        l.textContent = w[i];
        l.style.transitionDelay = (k * 28) + 'ms';
        k++;
        wrap.appendChild(l);
      }
      root.appendChild(wrap);
      if (wi < words.length - 1) root.appendChild(document.createTextNode(' '));
    });
  }

  function initAbout() {
    wordSpans('Hi, I am Zainab.', $('about-line-1'));
    wordSpans('Call me Zu.', $('about-line-2'));
  }

  var aboutRevealed = false, bookRevealed = false;

  function updateAbout() {
    var el = $('about');
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight;
    if (!aboutRevealed && (state.reduced || rect.top < vh * 0.8)) {
      aboutRevealed = true;
      $('about-title').classList.add('in');
      $('about-body').classList.add('in');
    }
  }

  function updateBookReveal() {
    var el = $('book');
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight;
    if (!bookRevealed && (state.reduced || rect.top < vh * 0.85)) {
      bookRevealed = true;
      $('book-form').classList.add('in');
    }
  }

  // ---------- Zoom ----------
  function glassFit() { return Math.min(1, (window.innerWidth - 40) / 1400); }

  function fitGlassText() {
    var glass = $('zoom-glass'), text = $('zoom-clip-text');
    var w = glass.clientWidth, h = glass.clientHeight;
    if (!w || !h) return;
    text.setAttribute('x', round3(w / 2));
    text.setAttribute('y', round3(h * 0.64));
    text.setAttribute('font-size', round3(h * 0.72));
    text.setAttribute('textLength', round3(w * 0.94));
  }

  function updateZoom() {
    var sec = $('zoom');
    var pin = sec.querySelector('.zoom-pin');
    var rect = sec.getBoundingClientRect();
    var pinH = pin.getBoundingClientRect().height || window.innerHeight;
    var extra = isMobile() ? Math.round(window.innerHeight * 1.3) : Math.round(window.innerHeight * 1.8);
    sec.style.minHeight = (pinH + extra) + 'px';
    var over = rect.height - pinH;
    var zp = over > 2 ? cl01(-rect.top / over) : 0;
    var fit = glassFit();
    var scale = round3(fit * (1 + Math.pow(zp, 2.6) * 38));
    var glass = $('zoom-glass');
    glass.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
    var op = round3(zp < 0.8 ? 1 : cl01(1 - (zp - 0.8) / 0.12));
    glass.style.opacity = op;
    var img = $('zoom-img');
    img.style.filter = 'brightness(' + round3(0.48 + 0.52 * cl01((zp - 0.72) / 0.22)) + ') saturate(' + round3(0.85 + 0.15 * cl01((zp - 0.72) / 0.22)) + ')';
    img.style.transform = 'scale(' + round3(1.08 - 0.08 * zp) + ')';
    $('zoom-hint').style.opacity = round3(state.reduced ? 0 : cl01(1 - zp * 6));
    $('zoom-cta').classList.toggle('show', state.reduced || zp > 0.86);
  }

  // ---------- Booking: chips ----------
  function renderShootChips() {
    var host = $('shoot-chips');
    host.innerHTML = '';
    SHOOT_OPTS.forEach(function (label, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.setAttribute('aria-pressed', state.shoot === i ? 'true' : 'false');
      btn.textContent = label;
      btn.addEventListener('click', function () { state.shoot = i; renderShootChips(); });
      host.appendChild(btn);
    });
  }

  // ---------- Booking: need dropdown ----------
  function renderNeedDropdown() {
    $('need-picker-label').textContent = NEED_OPTS[state.need];
    var host = $('need-pop');
    host.innerHTML = '';
    NEED_OPTS.forEach(function (label, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.className = 'opt';
      btn.setAttribute('aria-selected', state.need === i ? 'true' : 'false');
      btn.innerHTML = '<span>' + label + '</span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
      btn.addEventListener('click', function () { state.need = i; renderNeedDropdown(); closePopovers(); });
      host.appendChild(btn);
    });
  }

  // ---------- Booking: calendar ----------
  var calCY = new Date().getFullYear(), calCM = new Date().getMonth();
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function isoDate(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  function renderCalendar() {
    var now = new Date(), todayKey = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    $('cal-month').textContent = MONTHS[calCM] + ' ' + calCY;
    $('cal-prev').disabled = (calCY === now.getFullYear() && calCM === now.getMonth());
    var off = (new Date(calCY, calCM, 1).getDay() + 6) % 7;
    var dim = new Date(calCY, calCM + 1, 0).getDate();
    var host = $('cal-days');
    host.innerHTML = '';
    for (var i = 0; i < off; i++) {
      var empty = document.createElement('button');
      empty.type = 'button'; empty.className = 'day empty'; empty.disabled = true; empty.tabIndex = -1;
      host.appendChild(empty);
    }
    for (var d = 1; d <= dim; d++) {
      var key = isoDate(calCY, calCM, d);
      var wd = new Date(calCY, calCM, d).getDay();
      var btn = document.createElement('button');
      btn.type = 'button';
      var cls = 'day';
      if (key === todayKey) cls += ' today';
      if (key === state.date) cls += ' on';
      if (wd === 0 || wd === 6) cls += ' wk';
      btn.className = cls;
      btn.disabled = key < todayKey;
      btn.setAttribute('aria-label', WEEK[wd] + ' ' + d + ' ' + MONTHS[calCM] + ' ' + calCY);
      btn.setAttribute('aria-pressed', key === state.date ? 'true' : 'false');
      btn.textContent = String(d);
      btn.addEventListener('click', function (key) { return function () { state.date = key; closePopovers(); renderDateLabel(); }; }(key));
      host.appendChild(btn);
    }
  }

  function renderDateLabel() {
    var label = $('date-picker-label');
    if (!state.date) { label.textContent = 'Choose a date'; label.classList.add('picker-placeholder'); return; }
    var p = state.date.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    label.textContent = WEEK[dt.getDay()] + ', ' + p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
    label.classList.remove('picker-placeholder');
  }

  function closePopovers() {
    ['calendar-pop', 'need-pop'].forEach(function (id) {
      var el = $(id);
      el.hidden = true;
    });
    $('date-picker').setAttribute('aria-expanded', 'false');
    $('need-picker').setAttribute('aria-expanded', 'false');
  }

  function openPopover(popId, pickerId, neededSpace) {
    var pop = $(popId), picker = $(pickerId);
    var wasOpen = !pop.hidden;
    closePopovers();
    if (wasOpen) return;
    var r = picker.getBoundingClientRect();
    var below = window.innerHeight - r.bottom, above = r.top;
    pop.classList.toggle('up', below < neededSpace && above > below);
    pop.hidden = false;
    picker.setAttribute('aria-expanded', 'true');
  }

  function initBooking() {
    renderShootChips();
    renderNeedDropdown();
    renderCalendar();
    renderDateLabel();

    $('date-picker').addEventListener('click', function () { openPopover('calendar-pop', 'date-picker', 450); });
    $('need-picker').addEventListener('click', function () { openPopover('need-pop', 'need-picker', 60 + NEED_OPTS.length * 46); });
    $('cal-prev').addEventListener('click', function () { calCM--; if (calCM < 0) { calCM = 11; calCY--; } renderCalendar(); });
    $('cal-next').addEventListener('click', function () { calCM++; if (calCM > 11) { calCM = 0; calCY++; } renderCalendar(); });
    $('cal-today').addEventListener('click', function () {
      var now = new Date();
      calCY = now.getFullYear(); calCM = now.getMonth();
      state.date = isoDate(calCY, calCM, now.getDate());
      closePopovers(); renderDateLabel(); renderCalendar();
    });
    $('cal-clear').addEventListener('click', function () { state.date = ''; renderDateLabel(); renderCalendar(); });

    document.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (t && t.closest && (t.closest('.popover') || t.closest('.picker'))) return;
      closePopovers();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopovers(); });

    $('book-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('name-input').value || '';
      var msg = 'Hi Zainab! I would like to book a ' + SHOOT_OPTS[state.shoot].toLowerCase() +
        (state.date ? ' on ' + state.date : '') + '.' +
        ' I need: ' + NEED_OPTS[state.need].toLowerCase() + '.' +
        (name ? ' My name is ' + name + '.' : '');
      try { window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg), '_blank', 'noopener'); } catch (err) { /* popup blocked */ }
      state.sent = true;
      $('book-form').hidden = true;
      $('book-sent').hidden = false;
    });
  }

  // ---------- Lightbox ----------
  var ovIndex = -1;

  function renderLightbox() {
    if (ovIndex < 0) return;
    var f = ALL_FRAMES[ovIndex];
    $('lightbox-num').textContent = pad2(ovIndex + 1) + ' · ' + f.cat;
    $('lightbox-img').src = f.img;
    $('lightbox-img').alt = f.alt;
    $('lightbox-title').textContent = f.title;
    $('lightbox-meta').textContent = f.meta;
  }

  function openLightbox(i, triggerEl) {
    ovIndex = i;
    renderLightbox();
    var lb = $('lightbox');
    lb.hidden = false;
    lb.classList.remove('open');
    if (state.reduced || !triggerEl) {
      lb.style.clipPath = 'none';
    } else {
      var r = triggerEl.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      lb.style.clipPath = 'inset(' + Math.max(0, r.top) + 'px ' + Math.max(0, W - r.right) + 'px ' + Math.max(0, H - r.bottom) + 'px ' + Math.max(0, r.left) + 'px round 2px)';
    }
    lastTrigger = triggerEl;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        lb.classList.add('open');
        lb.style.clipPath = 'inset(0px 0px 0px 0px)';
      });
    });
  }
  var lastTrigger = null;

  function closeLightbox() {
    var lb = $('lightbox');
    lb.classList.remove('open');
    if (lastTrigger) {
      var r = lastTrigger.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      lb.style.clipPath = 'inset(' + Math.max(0, r.top) + 'px ' + Math.max(0, W - r.right) + 'px ' + Math.max(0, H - r.bottom) + 'px ' + Math.max(0, r.left) + 'px round 2px)';
    }
    setTimeout(function () {
      lb.hidden = true;
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    }, state.reduced ? 0 : 1100);
  }

  function initLightbox() {
    $('lightbox-close').addEventListener('click', closeLightbox);
    $('lightbox-next').addEventListener('click', function () { ovIndex = (ovIndex + 1) % ALL_FRAMES.length; renderLightbox(); });
    $('lightbox-book').addEventListener('click', function () { closeLightbox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('lightbox').hidden) closeLightbox(); });
  }

  // ---------- Bottom CTA (mobile) ----------
  function updateBottomCta() {
    if (!isMobile()) { $('bottom-cta').classList.remove('show'); return; }
    var y = window.pageYOffset;
    var bookRect = $('book').getBoundingClientRect();
    var zoomRect = $('zoom').getBoundingClientRect();
    var inBook = bookRect.top < window.innerHeight * 0.7;
    var inZoom = zoomRect.top < window.innerHeight * 0.6 && zoomRect.bottom > window.innerHeight * 0.4;
    $('bottom-cta').classList.toggle('show', y > 500 && !inBook && !inZoom && $('lightbox').hidden);
  }

  // ---------- IntersectionObserver reveal for mobile strip ----------
  function initMobileStripReveal() {
    if (!('IntersectionObserver' in window)) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) entry.target.classList.add('in'); });
    }, { threshold: 0.2 });
    frameEls.forEach(function (fe) { obs.observe(fe.wrap); });
  }

  // ---------- Main loop ----------
  var rafPending = false;
  function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; update(); });
  }

  function update() {
    updateReel();
    tickMarquee();
    updateWork();
    updateFilms();
    updateQuote();
    updateCards();
    updateAbout();
    updateBookReveal();
    updateZoom();
    updateBottomCta();
  }

  function loop() {
    update();
    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  function boot() {
    runIntro();
    initHeroTitle();
    initHeroDeck();
    if (!state.reduced) initCursorTrail();
    initCursor();
    initMagnetic();
    initReel();
    renderChips();
    buildStrip(false);
    initMobileStripReveal();
    initFilms();
    initQuote();
    initAbout();
    initBooking();
    initLightbox();

    document.querySelectorAll('[data-mag]').forEach(function (el) {
      el.setAttribute('data-cursor', el.textContent.trim());
    });
    $('film-play').setAttribute('data-cursor', 'Play');

    fitGlassText();
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('resize', fitGlassText, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, { passive: true });

    if (state.reduced) {
      update();
    } else {
      requestAnimationFrame(loop);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
