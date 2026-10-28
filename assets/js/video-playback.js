(() => {
  const teaserVideos = [...document.querySelectorAll('[data-sync-video]')];
  const resultVideos = [...document.querySelectorAll('[data-autoplay-in-view]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visibleTeasers = new Set();
  const visibleResults = new Set();
  const expectedPauses = new WeakSet();
  const manualControls = new WeakSet();

  const showPlaybackControls = (video) => {
    video.controls = true;
  };

  const hideAutomaticControls = (video) => {
    if (!reducedMotion && !manualControls.has(video)) {
      video.controls = false;
    }
  };

  const resetPlaybackControls = (video) => {
    manualControls.delete(video);
    hideAutomaticControls(video);
  };

  [...teaserVideos, ...resultVideos].forEach((video) => {
    const revealControls = () => {
      manualControls.add(video);
      showPlaybackControls(video);
    };
    video.tabIndex = 0;
    video.addEventListener('pointerdown', revealControls);
    video.addEventListener('focusin', revealControls);
    video.addEventListener('keydown', (event) => {
      if (!video.controls && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        revealControls();
      }
    });
    hideAutomaticControls(video);
  });

  let teaserPlaybackRequested = !reducedMotion;
  let startingTeasers = false;
  let teaserRetryRequested = false;
  let bufferingTeasers = false;
  let teaserAutoplayBlocked = false;

  teaserVideos.forEach((video) => {
    // Safari checks these properties when play() is requested.
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
  });

  const noMarginVideo = document.querySelector('[data-no-margin-video]');
  const failureOverlay = document.querySelector('[data-failure-overlay]');
  if (noMarginVideo && failureOverlay) {
    const updateFailureOverlay = () => {
      const isVisible = noMarginVideo.currentTime >= 8.1;
      failureOverlay.classList.toggle('is-visible', isVisible);
      failureOverlay.setAttribute('aria-hidden', String(!isVisible));
    };
    ['loadedmetadata', 'timeupdate', 'seeked'].forEach((eventName) => {
      noMarginVideo.addEventListener(eventName, updateFailureOverlay);
    });
  }

  const pauseTeaser = (video) => {
    if (!video.paused) {
      expectedPauses.add(video);
      video.pause();
    }
  };

  const pauseTeasers = () => teaserVideos.forEach(pauseTeaser);

  const alignTeasers = (referenceVideo) => {
    teaserVideos.forEach((video) => {
      if (video !== referenceVideo && video.readyState >= 1 &&
          Math.abs(video.currentTime - referenceVideo.currentTime) > 0.04) {
        video.currentTime = referenceVideo.currentTime;
      }
    });
  };

  const teasersShouldPlay = () => teaserPlaybackRequested &&
    visibleTeasers.size > 0 && !document.hidden;

  const updateTeasers = () => {
    if (!visibleTeasers.size) teaserVideos.forEach(resetPlaybackControls);
    if (!teasersShouldPlay() || teaserAutoplayBlocked) {
      pauseTeasers();
      return;
    }
    if (startingTeasers) {
      teaserRetryRequested = true;
      return;
    }
    if (bufferingTeasers && teaserVideos.some((video) => video.readyState < 3)) return;
    if (teaserVideos.every((video) => !video.paused)) return;

    // Request playback to initiate loading: Safari may ignore preload="auto".
    // Waiting for canplay before this request can prevent startup entirely.
    bufferingTeasers = false;
    teaserRetryRequested = false;
    alignTeasers(teaserVideos[0]);
    startingTeasers = true;
    let started = false;
    Promise.all(teaserVideos.map((video) => {
      hideAutomaticControls(video);
      video.muted = true;
      return Promise.resolve(video.play()).then(() => {
        // Hold a ready clip while its partner finishes loading.
        if (!teasersShouldPlay() || teaserVideos.some((other) =>
          other !== video && other.readyState < 3)) {
          pauseTeaser(video);
        }
      });
    }))
      .then(() => {
        started = true;
        if (teasersShouldPlay()) alignTeasers(teaserVideos[0]);
        else pauseTeasers();
      })
      .catch((error) => {
        // Browser policy may require a tap; transient load errors may recover.
        if (error.name === 'NotAllowedError') {
          teaserAutoplayBlocked = true;
          teaserVideos.forEach(showPlaybackControls);
        }
        pauseTeasers();
      })
      .finally(() => {
        startingTeasers = false;
        const shouldRetry = teaserRetryRequested ||
          (started && teaserVideos.some((video) => video.paused));
        teaserRetryRequested = false;
        if (teasersShouldPlay() && !teaserAutoplayBlocked && shouldRetry) {
          updateTeasers();
        }
      });
  };

  if (teaserVideos.length === 2) {
    teaserVideos.forEach((video) => {
      ['loadedmetadata', 'loadeddata', 'canplay'].forEach((eventName) => {
        video.addEventListener(eventName, updateTeasers);
      });
      video.addEventListener('waiting', () => {
        if (startingTeasers || !teasersShouldPlay()) return;
        bufferingTeasers = true;
        pauseTeasers();
      });
      video.addEventListener('play', () => {
        if (startingTeasers) return;
        teaserPlaybackRequested = true;
        teaserAutoplayBlocked = false;
        alignTeasers(video);
        updateTeasers();
      });
      video.addEventListener('pause', () => {
        if (expectedPauses.delete(video)) return;
        teaserPlaybackRequested = false;
        pauseTeasers();
      });
      video.addEventListener('seeking', () => {
        const otherVideo = teaserVideos.find((other) => other !== video);
        if (otherVideo.readyState >= 1 &&
            Math.abs(otherVideo.currentTime - video.currentTime) > 0.12) {
          otherVideo.currentTime = video.currentTime;
        }
      });
    });

    const [referenceVideo, comparisonVideo] = teaserVideos;
    referenceVideo.addEventListener('timeupdate', () => {
      if (referenceVideo.paused || comparisonVideo.paused) return;
      const drift = comparisonVideo.currentTime - referenceVideo.currentTime;
      if (Math.abs(drift) > 0.12 && Math.abs(drift) < referenceVideo.duration / 2) {
        comparisonVideo.currentTime = referenceVideo.currentTime;
      }
    });
  }

  const loadResultVideo = (video) => {
    const sources = [...video.querySelectorAll('source[data-src]')];
    if (!sources.length) return;
    sources.forEach((source) => {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
    });
    video.preload = 'auto';
    video.load();
  };

  const updateResultVideo = (video) => {
    if (!visibleResults.has(video) || document.hidden) {
      video.pause();
      if (!visibleResults.has(video)) resetPlaybackControls(video);
    } else if (!reducedMotion) {
      loadResultVideo(video);
      hideAutomaticControls(video);
      video.play().catch((error) => {
        if (error.name === 'NotAllowedError') showPlaybackControls(video);
      });
    }
  };

  const setResultVisibility = (video, isVisible) => {
    const wasVisible = visibleResults.has(video);
    if (isVisible) visibleResults.add(video);
    else visibleResults.delete(video);
    if (wasVisible !== isVisible) updateResultVideo(video);
  };

  if ('IntersectionObserver' in window) {
    const teaserObserver = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting, intersectionRatio }) => {
        if (isIntersecting && intersectionRatio > 0) {
          if (!visibleTeasers.has(target)) teaserAutoplayBlocked = false;
          visibleTeasers.add(target);
        } else visibleTeasers.delete(target);
      });
      updateTeasers();
    }, { threshold: 0 });
    teaserVideos.forEach((video) => teaserObserver.observe(video));

    const preloadObserver = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        loadResultVideo(target);
        preloadObserver.unobserve(target);
      });
    }, { rootMargin: '300px 0px', threshold: 0 });
    resultVideos.forEach((video) => preloadObserver.observe(video));

    const resultObserver = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting, intersectionRatio }) => {
        setResultVisibility(target, isIntersecting && intersectionRatio >= 0.45);
      });
    }, { threshold: [0, 0.45] });
    resultVideos.forEach((video) => resultObserver.observe(video));
  } else {
    // Preserve visibility control in browsers without IntersectionObserver.
    const checkVisibility = () => {
      teaserVideos.forEach((video) => {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          if (!visibleTeasers.has(video)) teaserAutoplayBlocked = false;
          visibleTeasers.add(video);
        } else visibleTeasers.delete(video);
      });
      updateTeasers();
      resultVideos.forEach((video) => {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > -300 && rect.top < window.innerHeight + 300) loadResultVideo(video);
        const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        setResultVisibility(video, visibleHeight > 0 && visibleHeight >= rect.height * 0.45);
      });
    };
    let scheduled = false;
    const scheduleVisibilityCheck = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        checkVisibility();
      });
    };
    window.addEventListener('scroll', scheduleVisibilityCheck, { passive: true });
    window.addEventListener('resize', scheduleVisibilityCheck);
    checkVisibility();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) teaserAutoplayBlocked = false;
    updateTeasers();
    resultVideos.forEach(updateResultVideo);
  });
})();
