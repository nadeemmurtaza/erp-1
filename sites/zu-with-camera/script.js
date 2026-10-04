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
      img.style.transition = 'transform 650ms cubic-bezier(.16,1,.3,1), opacity 450ms cubic-bezier(.2,0,0,1)';
      deckEl.appendChild(img);
      return img;
    });
    renderDeck();
  }

  function renderDeck() {
    var n = deckSlots.length;
    var layout = { 0: { t: 'translate(0px, 0px) rotate(-2deg)', o: 1, z: 10 }, 1: { t: 'translate(14px, 10px) rotate(4deg)', o: 1, z: 9 }, 2: { t: 'translate(-12px, 18px) rotate(-6deg)', o: 1, z: 8 } };
    deckSlots.forEach(function (img, i) {
      var pos = (i - deckIndex + n) % n;
      // The card that was just dismissed flies off to the left; the rest wait underneath.
      var sl = layout[pos] || (pos === n - 1 ? { t: 'translate(-150%, -30px) rotate(-26deg)', o: 0, z: 11 } : { t: 'translate(0px, 24px) rotate(0deg)', o: 0, z: 1 });
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

  // ---------- Motion helpers ----------
  // Frame-rate independent easing: closes (1 - e^(-rate*dt)) of the gap each frame.
  var damp = function (cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); };

  // Writes a style only when it changed, so idle frames cost nothing.
  function setStyle(el, prop, val) {
    var k = '_s_' + prop;
    if (el[k] === val) return;
    el[k] = val;
    el.style[prop] = val;
  }
  function setVar(el, name, val) {
    var k = '_v_' + name;
    if (el[k] === val) return;
    el[k] = val;
    el.style.setProperty(name, val);
  }
  function setText(el, val) {
    if (el._t === val) return;
    el._t = val;
    el.textContent = val;
  }
  function setFlag(el, cls, on) {
    var k = '_f_' + cls;
    if (el[k] === on) return;
    el[k] = on;
    el.classList.toggle(cls, on);
  }

  // ---------- Cursor trail (desktop hero) ----------
  var trailPool = [];
  var trailK = 0;

  function initCursorTrail() {
    var host = $('cursor-trail');
    for (var i = 0; i < 7; i++) {
      var img = document.createElement('img');
      img.className = 'trail-item';
      img.alt = '';
      host.appendChild(img);
      trailPool.push(img);
    }
    var lastX = null, lastY = null;
    var ease = 'cubic-bezier(.16,1,.3,1)';
    $('hero').addEventListener('mousemove', function (e) {
      if (state.reduced || !finePointer()) return;
      var x = e.clientX, y = e.clientY + (window.pageYOffset || 0);
      if (lastX != null && Math.hypot(x - lastX, y - lastY) < 110) return;
      lastX = x; lastY = y;
      var slot = trailK % trailPool.length;
      trailK++;
      var img = trailPool[slot];
      var rot = ((trailK * 37) % 17) - 8;
      var base = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) rotate(' + rot + 'deg) ';
      img.src = ALL_FRAMES[trailK % ALL_FRAMES.length].img;
      if (img._anim) img._anim.cancel();
      // One keyframed animation per photo: it always starts from its own pose, so a reused
      // slot never glides in from where the previous photo was.
      img._anim = img.animate([
        { opacity: 0, transform: base + 'scale(.55)', offset: 0, easing: ease },
        { opacity: 1, transform: base + 'scale(1)', offset: 0.14 },
        { opacity: 1, transform: base + 'scale(1)', offset: 0.7, easing: ease },
        { opacity: 0, transform: base + 'scale(.9)', offset: 1 }
      ], { duration: 1300, fill: 'both' });
    });
  }

  // ---------- Custom cursor + magnetic buttons ----------
  var cursorEl = null, cursorOn = false;
  var cursorTarget = { x: 0, y: 0 }, cursorPos = { x: 0, y: 0 };

  function initCursor() {
    cursorEl = $('cursor');
    var label = $('cursor-label');
    if (!finePointer()) return;
    document.addEventListener('mousemove', function (e) {
      cursorTarget.x = e.clientX; cursorTarget.y = e.clientY;
      if (!cursorOn) {
        cursorOn = true;
        cursorPos.x = e.clientX; cursorPos.y = e.clientY;
        cursorEl.classList.add('on');
      }
    });
    document.addEventListener('mouseleave', function () { cursorOn = false; cursorEl.classList.remove('on'); });
    document.querySelectorAll('[data-cursor]').forEach(function (el) {
      el.addEventListener('mouseenter', function () { label.textContent = el.getAttribute('data-cursor'); cursorEl.classList.add('label'); });
      el.addEventListener('mouseleave', function () { cursorEl.classList.remove('label'); label.textContent = ''; });
    });
  }

  function renderCursor(dt) {
    if (!cursorOn) return;
    cursorPos.x = damp(cursorPos.x, cursorTarget.x, 26, dt);
    cursorPos.y = damp(cursorPos.y, cursorTarget.y, 26, dt);
    setStyle(cursorEl, 'transform', 'translate3d(' + cursorPos.x.toFixed(1) + 'px,' + cursorPos.y.toFixed(1) + 'px,0)');
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

  // ---------- Reel progress nav ----------
  var reelFill, reelMarks = [], frameCounter;

  function initReel() {
    var marksHost = $('reel-marks');
    reelFill = $('reel-fill');
    frameCounter = $('frame-counter');
    SECTIONS.forEach(function (s) {
      var a = document.createElement('a');
      a.href = '#' + s[0];
      a.innerHTML = '<i></i><span class="mono">' + s[1] + '</span>';
      marksHost.appendChild(a);
      reelMarks.push(a);
    });
  }

  // ---------- Contact sheet ----------
  var stripTrack = $('strip-track');
  var stripViewport = stripTrack.parentElement;
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
        buildStrip();
        stripViewport.scrollLeft = 0;
      });
      host.appendChild(btn);
    });
  }

  function filteredFrames() {
    return state.cat === 'All' ? ALL_FRAMES : ALL_FRAMES.filter(function (f) { return f.cat === state.cat; });
  }

  function buildStrip() {
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
      btn.addEventListener('click', function () { openLightbox(gi, btn); });
      wrap.appendChild(btn);
      stripTrack.appendChild(wrap);
      return { wrap: wrap, btn: btn, img: btn.firstChild, cx: 0 };
    });
    $('work-count').textContent = 'Frame 01 / ' + pad2(list.length) + ' · click to open';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        frameEls.forEach(function (fe) { fe.wrap.classList.add('in'); });
      });
    });
    measure();
  }

  // ---------- Films ----------
  var filmPlaying = false;
  var filmOpen = 0;

  function initFilms() {
    var play = $('film-play');
    play.addEventListener('click', function () {
      filmPlaying = !filmPlaying;
      play.setAttribute('aria-pressed', filmPlaying ? 'true' : 'false');
      play.setAttribute('aria-label', filmPlaying ? 'Pause showreel' : 'Play showreel');
      $('film-play-icon').hidden = filmPlaying;
      $('film-now').hidden = !filmPlaying;
      $('film-progress').classList.toggle('running', filmPlaying);
    });
  }

  // ---------- Quote ----------
  var quoteSpans = [];

  function initQuote() {
    var text = 'Someone just captured the best angles of me. I will reach out to you every time.';
    var host = $('quote-text');
    host.innerHTML = text.split(' ').map(function (w) { return '<span>' + w + ' </span>'; }).join('');
    quoteSpans = Array.prototype.slice.call(host.querySelectorAll('span'));
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

  // ---------- Fit headings to their column ----------
  // The headings are sized large in CSS; this only ever shrinks them (never wraps, never clips),
  // which also covers the fallback font used before/without the webfont.
  function fitHeading(title) {
    title.style.fontSize = '';
    var avail = title.clientWidth;
    if (!avail) return;
    var need = 0;
    title.querySelectorAll('.hero-line, .about-line').forEach(function (line) {
      var ls = line.querySelectorAll('.ltr, .about-letter');
      if (!ls.length) return;
      var first = ls[0], last = ls[ls.length - 1];
      need = Math.max(need, last.offsetLeft + last.offsetWidth - first.offsetLeft);
    });
    if (need > avail) {
      title.style.fontSize = (parseFloat(getComputedStyle(title).fontSize) * avail / need * 0.995).toFixed(2) + 'px';
    }
  }

  // ---------- Zoom (LET'S SHOOT) ----------
  function fitGlassText() {
    var glass = $('zoom-glass'), t1 = $('zoom-clip-text'), t2 = $('zoom-clip-text-2');
    var w = glass.clientWidth, h = glass.clientHeight;
    if (!w || !h) return;
    var set = function (t, x, y, fs, tl) {
      t.setAttribute('x', round3(x)); t.setAttribute('y', round3(y));
      t.setAttribute('font-size', round3(fs)); t.setAttribute('textLength', round3(tl));
    };
    var hText;
    if (isMobile()) {
      t1.textContent = 'LET’S';
      t2.textContent = 'SHOOT';
      set(t1, w / 2, h * 0.433, h * 0.5, w * 0.838);
      set(t2, w / 2, h * 0.893, h * 0.5, w * 0.95);
      hText = t2;
    } else {
      t1.textContent = 'LET’S SHOOT';
      t2.textContent = '';
      set(t1, w / 2, h * 0.794, h * 0.818, w * 0.957);
      hText = t1;
    }
    // Zoom towards the H so the viewer passes through the letter into the photo.
    var origin = '50% 60%';
    try {
      var i = hText.textContent.indexOf('H');
      var b = i >= 0 && hText.getExtentOfChar ? hText.getExtentOfChar(i) : null;
      if (b && b.width) origin = (b.x + b.width * 0.2).toFixed(1) + 'px ' + (b.y + b.height * 0.55).toFixed(1) + 'px';
    } catch (err) { /* keep the centred fallback */ }
    glass.style.transformOrigin = origin;
  }

  // ---------- Layout metrics (measured once per resize, never per frame) ----------
  var M = {
    vw: 0, vh: 0, mobile: false, total: 1,
    hero: { h: 0 }, mq: { top: 0, h: 0 },
    work: { top: 0, h: 0, pinH: 0, over: 0 },
    films: { top: 0, h: 0, pinH: 0 },
    zoom: { top: 0, h: 0, pinH: 0 },
    words: { top: 0, h: 0 }, services: { top: 0, h: 0 }, about: { top: 0 }, book: { top: 0 },
    card: { top: 0, h0: 1, h1: 1, gap: 0, st0: 0, st1: 0, st2: 0 },
    marks: []
  };

  function setMinHeight(el, px) {
    var v = px > 0 ? Math.round(px) + 'px' : '';
    if (el._mh === v) return;
    el._mh = v;
    el.style.minHeight = v;
  }

  function measure() {
    fitHeading($('hero-title'));
    fitHeading($('about-title'));
    fitGlassText();

    var vw = window.innerWidth, vh = window.innerHeight, mobile = isMobile();
    var work = $('work'), films = $('films'), zoom = $('zoom');
    var workPinH = work.firstElementChild.offsetHeight;
    var filmsPinH = films.firstElementChild.offsetHeight;
    var zoomPinH = zoom.firstElementChild.offsetHeight;

    // Scroll runway for each pinned scene. Strip travel is 1:1 with scroll; the other two are
    // short enough that something is always visibly moving while they are pinned.
    var padX = 40;
    var over = mobile ? 0 : Math.max(0, stripTrack.offsetWidth + padX * 2 - vw);
    var filmsRun = state.reduced ? 0 : Math.round(vh * (mobile ? 0.8 : 1));
    var zoomRun = state.reduced ? 0 : Math.round(vh * (mobile ? 1.3 : 1.5));
    setMinHeight(work, over > 0 ? workPinH + over : 0);
    setMinHeight(films, filmsPinH + filmsRun);
    setMinHeight(zoom, zoomPinH + zoomRun);
    stripViewport.classList.toggle('is-static', !mobile && over <= 0);

    var y0 = window.pageYOffset || 0;
    var topOf = function (el) { return el.getBoundingClientRect().top + y0; };

    M.vw = vw; M.vh = vh; M.mobile = mobile;
    M.total = Math.max(1, document.documentElement.scrollHeight - vh);
    M.hero.h = $('hero').offsetHeight;
    var mq = document.querySelector('.marquee-band');
    M.mq.top = topOf(mq); M.mq.h = mq.offsetHeight;
    M.work = { top: topOf(work), h: work.offsetHeight, pinH: workPinH, over: over };
    M.films = { top: topOf(films), h: films.offsetHeight, pinH: filmsPinH };
    M.zoom = { top: topOf(zoom), h: zoom.offsetHeight, pinH: zoomPinH };
    var words = $('words'), services = $('services');
    M.words = { top: topOf(words), h: words.offsetHeight };
    M.services = { top: topOf(services), h: services.offsetHeight };
    M.about.top = topOf($('about'));
    M.book.top = topOf($('book'));

    var cardsEl = document.querySelector('.cards');
    var c0 = $('card-0'), c1 = $('card-1'), c2 = $('card-2');
    M.card = {
      top: topOf(cardsEl), h0: c0.offsetHeight, h1: c1.offsetHeight,
      gap: parseFloat(getComputedStyle(cardsEl).rowGap) || 0,
      st0: parseFloat(getComputedStyle(c0).top) || 0,
      st1: parseFloat(getComputedStyle(c1).top) || 0,
      st2: parseFloat(getComputedStyle(c2).top) || 0
    };

    frameEls.forEach(function (fe) { fe.cx = fe.wrap.offsetLeft + fe.wrap.offsetWidth / 2; });

    M.marks = SECTIONS.map(function (s, i) {
      var top = s[0] === 'hero' ? 0 : topOf($(s[0]));
      if (reelMarks[i]) reelMarks[i].style.left = round3(Math.min(100, (top / M.total) * 100)) + '%';
      return top;
    });
  }

  var measureQueued = false;
  function scheduleMeasure() {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(function () { measureQueued = false; measure(); });
  }

  // ---------- Per-frame rendering ----------
  // Everything below reads only cached metrics and the scroll offset; styles are written only
  // when their value changes. `sy` is the scroll offset eased towards the real one, so every
  // scroll-linked scene glides instead of stepping with the wheel.
  var sy = window.pageYOffset || 0;
  var lastY = null, lastT = 0;
  var mqVel = 0, mqSpeed = 0, mqPos = 0, mqDir = 1, heroSkew = 0, activeMark = -1;
  var lightboxOpen = false;

  var inRange = function (top, h) { return sy + M.vh * 1.1 > top && sy < top + h + M.vh * 0.1; };

  function renderReel(y) {
    setStyle(reelFill, 'transform', 'scaleX(' + cl01(y / M.total).toFixed(4) + ')');
    var idx = 0;
    for (var i = 0; i < M.marks.length; i++) if (y + 2 >= M.marks[i]) idx = i;
    if (idx !== activeMark) {
      activeMark = idx;
      reelMarks.forEach(function (a, j) { a.classList.toggle('on', j === idx); });
    }
    setText(frameCounter, 'Frame ' + pad2(Math.floor(y / 40) % 100) + pad2(Math.floor(y / 4) % 100) + ' · Photo & film · Lahore');
  }

  function renderMarquee(dt, y) {
    var dy = lastY == null ? 0 : y - lastY;
    lastY = y;
    mqVel = damp(mqVel, dy / Math.max(dt * 60, 0.25), 9, dt);
    if (dy > 0.5) mqDir = 1; else if (dy < -0.5) mqDir = -1;
    var targetSpeed = state.reduced ? 0 : mqDir * (0.7 + Math.min(Math.abs(mqVel), 80) * 0.14);
    mqSpeed = damp(mqSpeed, targetSpeed, 5, dt);
    mqPos += mqSpeed * dt * 60;

    if (y + M.vh > M.mq.top - 60 && y < M.mq.top + M.mq.h + 60) {
      [['mq-1', 1, 1], ['mq-2', -1, 0.8]].forEach(function (m) {
        var el = $(m[0]);
        if (!el._half) el._half = el.scrollWidth / 2 || 1;
        var v = m[1] * m[2] * mqPos;
        var x = -(((v % el._half) + el._half) % el._half);
        setStyle(el, 'transform', 'translate3d(' + x.toFixed(1) + 'px,0,0)');
      });
    }
    if (y < M.hero.h) {
      heroSkew = damp(heroSkew, state.reduced ? 0 : clamp(-mqVel * 0.22, -9, 9) * 0.35, 10, dt);
      setStyle($('hero-title'), 'transform', 'skewY(' + heroSkew.toFixed(2) + 'deg)');
    }
  }

  function renderWork() {
    var w = M.work;
    var p = w.over > 0 ? cl01((sy - w.top) / w.over) : 0;
    var shift = p * w.over;
    setStyle(stripTrack, 'transform', 'translate3d(' + (-shift).toFixed(1) + 'px,0,0)');
    var center = M.vw / 2, best = 1e9, nearest = 0;
    frameEls.forEach(function (fe, i) {
      var d = (fe.cx - shift - center) / M.vw;
      if (Math.abs(d) < best) { best = Math.abs(d); nearest = i; }
      var close = w.over > 0 ? 1 - Math.min(Math.abs(d) * 1.7, 1) : 1;
      setStyle(fe.btn, 'transform', 'scale(' + (0.88 + 0.12 * close).toFixed(3) + ') rotate(' + (w.over > 0 ? (d * 4).toFixed(2) : '0') + 'deg)');
      setStyle(fe.img, 'filter', 'grayscale(' + (1 - close).toFixed(2) + ')');
    });
    setText($('work-count'), 'Frame ' + pad2(nearest + 1) + ' / ' + pad2(frameEls.length) + ' · click to open');
  }

  function renderFilms(dt) {
    var f = M.films, mobile = M.mobile;
    var over = f.h - f.pinH;
    var fp = over > 2 ? cl01((sy - f.top) / over) : 1;
    filmOpen = damp(filmOpen, filmPlaying ? 1 : 0, 7, dt);
    if (Math.abs(filmOpen - (filmPlaying ? 1 : 0)) < 0.002) filmOpen = filmPlaying ? 1 : 0;
    var eff = fp + (1 - fp) * filmOpen;
    setStyle($('films-ghost'), 'transform', 'translate3d(' + ((mobile ? 100 : 200) - fp * (mobile ? 900 : 1500)).toFixed(1) + 'px,-50%,0)');
    setStyle($('film-play'), 'clipPath', 'inset(' + ((1 - eff) * (mobile ? 12 : 16)).toFixed(2) + '% ' + ((1 - eff) * (mobile ? 14 : 20)).toFixed(2) + '% round ' + (4 + (1 - eff) * 10).toFixed(2) + 'px)');
    setStyle($('film-img'), 'transform', 'scale(' + (1.2 - 0.2 * eff).toFixed(3) + ')');
    setFlag($('film-link'), 'show', fp > 0.7 || over <= 2);
  }

  function renderQuote() {
    var q = M.words;
    var p = state.reduced ? 1 : cl01((M.vh * 0.9 - (q.top - sy)) / Math.max(1, M.vh * 0.55));
    quoteSpans.forEach(function (span, i) {
      setStyle(span, 'opacity', (0.14 + 0.86 * cl01(p * quoteSpans.length * 1.15 - i)).toFixed(2));
    });
  }

  function renderCards() {
    if (state.reduced) return;
    var c = M.card;
    var l1 = c.top + c.h0 + c.gap, l2 = l1 + c.h1 + c.gap;
    var t1 = Math.max(l1 - sy, c.st1), t2 = Math.max(l2 - sy, c.st2);
    var p0 = cl01(1 - (t1 - c.st0) / c.h0), p1 = cl01(1 - (t2 - c.st1) / c.h1);
    var c0 = $('card-0'), c1 = $('card-1');
    setStyle(c0, 'transform', 'scale(' + (1 - 0.05 * p0).toFixed(3) + ')');
    setVar(c0, '--dim', (0.25 * p0).toFixed(3));
    setStyle(c1, 'transform', 'scale(' + (1 - 0.05 * p1).toFixed(3) + ')');
    setVar(c1, '--dim', (0.25 * p1).toFixed(3));
  }

  function renderZoom() {
    var z = M.zoom;
    var over = z.h - z.pinH;
    var zp = over > 2 ? cl01((sy - z.top) / over) : 0;
    var glass = $('zoom-glass'), img = $('zoom-img');
    var op = zp < 0.8 ? 1 : cl01(1 - (zp - 0.8) / 0.12);
    setStyle(glass, 'transform', 'scale(' + (1 + Math.pow(zp, 2.6) * 38).toFixed(3) + ')');
    setStyle(glass, 'opacity', op.toFixed(3));
    // Once invisible, a 39x backdrop-filter layer is pure cost.
    setStyle(glass, 'visibility', op <= 0 ? 'hidden' : 'visible');
    var reveal = cl01((zp - 0.72) / 0.22);
    setStyle(img, 'filter', 'brightness(' + (0.48 + 0.52 * reveal).toFixed(3) + ') saturate(' + (0.85 + 0.15 * reveal).toFixed(3) + ')');
    setStyle(img, 'transform', 'scale(' + (1.08 - 0.08 * zp).toFixed(3) + ')');
    setStyle($('zoom-hint'), 'opacity', (state.reduced ? 0 : cl01(1 - zp * 6)).toFixed(3));
    setFlag($('zoom-cta'), 'show', state.reduced || zp > 0.86);
  }

  function renderReveals() {
    if (!aboutRevealed && (state.reduced || M.about.top - sy < M.vh * 0.8)) {
      aboutRevealed = true;
      $('about-title').classList.add('in');
      $('about-body').classList.add('in');
    }
    if (!bookRevealed && (state.reduced || M.book.top - sy < M.vh * 0.85)) {
      bookRevealed = true;
      $('book-form').classList.add('in');
    }
  }

  function renderBottomCta(y) {
    var show = false;
    if (M.mobile) {
      var inBook = M.book.top - sy < M.vh * 0.7;
      var inZoom = M.zoom.top - sy < M.vh * 0.6 && M.zoom.top + M.zoom.h - sy > M.vh * 0.4;
      show = y > 500 && !inBook && !inZoom && !lightboxOpen;
    }
    setFlag($('bottom-cta'), 'show', show);
  }

  function render(dt, instant) {
    var y = window.pageYOffset || 0;
    sy = (instant || state.reduced) ? y : damp(sy, y, 12, dt);
    if (Math.abs(sy - y) < 0.1) sy = y;

    renderReel(y);
    renderMarquee(dt, y);
    renderCursor(dt);
    if (!M.mobile && inRange(M.work.top, M.work.h)) renderWork();
    if (inRange(M.films.top, M.films.h)) renderFilms(dt);
    if (inRange(M.words.top, M.words.h)) renderQuote();
    if (inRange(M.services.top, M.services.h)) renderCards();
    if (inRange(M.zoom.top, M.zoom.h)) renderZoom();
    renderReveals();
    renderBottomCta(y);
  }

  function frame(now) {
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    render(dt, false);
    requestAnimationFrame(frame);
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
      scheduleMeasure();
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
    lightboxOpen = true;
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
      lightboxOpen = false;
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    }, state.reduced ? 0 : 1100);
  }

  function initLightbox() {
    $('lightbox-close').addEventListener('click', closeLightbox);
    $('lightbox-next').addEventListener('click', function () { ovIndex = (ovIndex + 1) % ALL_FRAMES.length; renderLightbox(); });
    $('lightbox-book').addEventListener('click', function () { closeLightbox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('lightbox').hidden) closeLightbox(); });
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
    buildStrip();
    initFilms();
    initQuote();
    initAbout();
    initBooking();
    initLightbox();

    document.querySelectorAll('[data-mag]').forEach(function (el) {
      el.setAttribute('data-cursor', el.textContent.trim());
    });
    $('film-play').setAttribute('data-cursor', 'Play');

    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMeasure);
    window.addEventListener('load', scheduleMeasure);
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(document.documentElement);

    render(1 / 60, true);
    if (state.reduced) {
      window.addEventListener('scroll', function () { render(1 / 60, true); }, { passive: true });
    } else {
      requestAnimationFrame(frame);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
