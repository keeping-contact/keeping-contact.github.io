(() => {
  const teaserVideos = [...document.querySelectorAll('[data-sync-video]')];
  const resultVideos = [...document.querySelectorAll('[data-autoplay-in-view]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visibleTeasers = new Set();
  const visibleResults = new Set();
  const expectedPauses = new WeakSet();
  let teaserPlaybackRequested = !reducedMotion;
  let startingTeasers = false;

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

  const pauseTeasers = () => {
    teaserVideos.forEach((video) => {
      if (!video.paused) {
        expectedPauses.add(video);
        video.pause();
      }
    });
  };

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
    if (!teasersShouldPlay() || teaserVideos.some((video) => video.readyState < 3)) {
      pauseTeasers();
      return;
    }
    if (startingTeasers || teaserVideos.every((video) => !video.paused)) return;

    alignTeasers(teaserVideos[0]);
    startingTeasers = true;
    Promise.all(teaserVideos.map((video) => video.play()))
      .then(() => {
        if (!teasersShouldPlay()) pauseTeasers();
      })
      .catch((error) => {
        // Scrolling away may interrupt play(); keep the intent to resume.
        if (error.name !== 'AbortError') teaserPlaybackRequested = false;
        pauseTeasers();
      })
      .finally(() => {
        startingTeasers = false;
        if (teasersShouldPlay() && teaserVideos.every((video) => video.readyState >= 3) &&
            teaserVideos.some((video) => video.paused)) {
          updateTeasers();
        }
      });
  };

  if (teaserVideos.length === 2) {
    teaserVideos.forEach((video) => {
      video.addEventListener('canplay', updateTeasers);
      video.addEventListener('waiting', pauseTeasers);
      video.addEventListener('play', () => {
        if (startingTeasers) return;
        teaserPlaybackRequested = true;
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
    } else if (!reducedMotion) {
      loadResultVideo(video);
      video.play().catch(() => {});
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
        if (isIntersecting && intersectionRatio > 0) visibleTeasers.add(target);
        else visibleTeasers.delete(target);
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
        if (rect.bottom > 0 && rect.top < window.innerHeight) visibleTeasers.add(video);
        else visibleTeasers.delete(video);
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
    updateTeasers();
    resultVideos.forEach(updateResultVideo);
  });
})();
