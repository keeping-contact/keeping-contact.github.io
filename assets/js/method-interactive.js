(() => {
  const root = document.querySelector('[data-method-interactive]');
  if (!root) return;

  const slider = root.querySelector('[data-angle-slider]');
  const angleOutput = root.querySelector('[data-angle-output]');
  const toggle = root.querySelector('[data-margin-toggle]');
  const toggleLabel = root.querySelector('[data-toggle-label]');
  const error = root.querySelector('[data-method-error]');
  const object = root.querySelector('[data-tilt-object]');
  const gravityLine = root.querySelector('[data-gravity-line]');
  const gravityLabel = root.querySelector('[data-gravity-label]');
  const demandLine = root.querySelector('[data-demand-line]');
  const demandArea = root.querySelector('[data-demand-area]');
  const demandGuide = root.querySelector('[data-demand-guide]');
  const demandPoint = root.querySelector('[data-demand-point]');
  const boxShape = root.querySelector('[data-box-shape]');
  const leftHemisphere = root.querySelector('[data-left-hemisphere]');
  const rightHemisphere = root.querySelector('[data-right-hemisphere]');
  const leftFingerStem = root.querySelector('[data-left-finger-stem]');
  const rightFingerStem = root.querySelector('[data-right-finger-stem]');
  const leftContact = root.querySelector('[data-left-contact]');
  const rightContact = root.querySelector('[data-right-contact]');
  const centerMarker = root.querySelector('[data-center-marker]');
  const leftConnector = root.querySelector('[data-left-connector]');
  const rightConnector = root.querySelector('[data-right-connector]');
  const contactViews = {
    left: root.querySelector('.contact-left'),
    right: root.querySelector('.contact-right')
  };

  const state = { angle: Number(slider.value), margin: true };
  const mobileLayout = window.matchMedia('(max-width: 650px)');
  const box = {
    widthMeters: 0.3,
    heightMeters: 0.2,
    pixelsPerMeter: 760,
    pivotX: 200,
    pivotY: 280
  };
  const boxGeometry = {
    width: box.widthMeters * box.pixelsPerMeter,
    height: box.heightMeters * box.pixelsPerMeter
  };
  const cone = { originX: 150, originY: 220, topY: 30, maxNormal: 26 };
  cone.scale = (cone.originY - cone.topY) / cone.maxNormal;
  const chart = { left: 54, right: 864, top: 18, bottom: 116 };
  let profile;
  let maxDemand;

  const rotatePoint = (x, y, angleDegrees, centerX = box.pivotX, centerY = box.pivotY) => {
    const radians = -angleDegrees * Math.PI / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    return {
      x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians)
    };
  };

  const setBoxGeometry = () => {
    const top = box.pivotY - boxGeometry.height;
    const right = box.pivotX + boxGeometry.width;
    const centerX = box.pivotX + boxGeometry.width / 2;
    const centerY = box.pivotY - boxGeometry.height / 2;
    const leftContactX = box.pivotX + boxGeometry.width * 0.16;
    const fingertipRadius = 18;

    boxShape.setAttribute('x', box.pivotX);
    boxShape.setAttribute('y', top);
    boxShape.setAttribute('width', boxGeometry.width);
    boxShape.setAttribute('height', boxGeometry.height);
    leftHemisphere.setAttribute('d', `M ${leftContactX - fingertipRadius} ${top - fingertipRadius} L ${leftContactX + fingertipRadius} ${top - fingertipRadius} A ${fingertipRadius} ${fingertipRadius} 0 0 1 ${leftContactX - fingertipRadius} ${top - fingertipRadius} Z`);
    rightHemisphere.setAttribute('d', `M ${right + fingertipRadius} ${centerY - fingertipRadius} L ${right + fingertipRadius} ${centerY + fingertipRadius} A ${fingertipRadius} ${fingertipRadius} 0 0 1 ${right + fingertipRadius} ${centerY - fingertipRadius} Z`);
    leftFingerStem.setAttribute('x1', leftContactX);
    leftFingerStem.setAttribute('y1', top - fingertipRadius);
    leftFingerStem.setAttribute('x2', leftContactX);
    leftFingerStem.setAttribute('y2', top - fingertipRadius - 26);
    rightFingerStem.setAttribute('x1', right + fingertipRadius);
    rightFingerStem.setAttribute('y1', centerY);
    rightFingerStem.setAttribute('x2', right + fingertipRadius + 26);
    rightFingerStem.setAttribute('y2', centerY);
    leftContact.setAttribute('cx', leftContactX);
    leftContact.setAttribute('cy', top);
    rightContact.setAttribute('cx', right);
    rightContact.setAttribute('cy', centerY);
    centerMarker.setAttribute('cx', centerX);
    centerMarker.setAttribute('cy', centerY);
  };

  const chartPoint = (sample) => ({
    x: chart.left + (sample.angle / 90) * (chart.right - chart.left),
    y: chart.bottom - (sample.taskDemand / maxDemand) * (chart.bottom - chart.top)
  });

  const drawDemandCurve = () => {
    const points = profile.samples.map(chartPoint);
    const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    demandLine.setAttribute('d', linePath);
    demandArea.setAttribute('d', `${linePath} L ${chart.right} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`);
  };

  const drawCone = (side, force) => {
    const view = contactViews[side];
    const mu = profile.frictionCoefficient;
    const maxNormal = cone.maxNormal;
    const coneHalfWidth = mu * maxNormal * cone.scale;
    const coneFillPath = `M ${cone.originX} ${cone.originY} L ${cone.originX - coneHalfWidth} ${cone.topY} L ${cone.originX + coneHalfWidth} ${cone.topY} Z`;
    const coneBoundaryPath = `M ${cone.originX - coneHalfWidth} ${cone.topY} L ${cone.originX} ${cone.originY} L ${cone.originX + coneHalfWidth} ${cone.topY}`;
    view.querySelector('[data-cone-fill]').setAttribute('d', coneFillPath);
    view.querySelector('[data-cone-boundary]').setAttribute('d', coneBoundaryPath);

    const margin = state.margin ? force.requiredMargin : 0;
    const distanceScale = Math.sqrt(1 + mu * mu);
    const apexNormal = margin * distanceScale / mu;
    const innerHalfWidth = Math.max(0, (mu * maxNormal - margin * distanceScale) * cone.scale);
    const apexY = cone.originY - apexNormal * cone.scale;
    const marginPath = `M ${cone.originX} ${apexY.toFixed(2)} L ${(cone.originX - innerHalfWidth).toFixed(2)} ${cone.topY} M ${cone.originX} ${apexY.toFixed(2)} L ${(cone.originX + innerHalfWidth).toFixed(2)} ${cone.topY}`;
    view.querySelector('[data-margin-boundary]').setAttribute('d', marginPath);

    const forceX = cone.originX + force.tangent * cone.scale;
    const forceY = cone.originY - force.normal * cone.scale;
    const vector = view.querySelector('[data-force-vector]');
    vector.setAttribute('x2', forceX.toFixed(2));
    vector.setAttribute('y2', forceY.toFixed(2));

    view.querySelector('[data-reserve-reading]').textContent = `Planned force margin ${force.reserve.toFixed(1)} N`;
    view.querySelector('[data-required-reading]').textContent = `Required margin ${margin.toFixed(1)} N`;
  };

  const drawModel = () => {
    const angle = state.angle;
    object.setAttribute('transform', `rotate(${-angle} ${box.pivotX} ${box.pivotY})`);
    const radians = -angle * Math.PI / 180;
    const leftPoint = rotatePoint(
      box.pivotX + boxGeometry.width * 0.16,
      box.pivotY - boxGeometry.height,
      angle
    );
    const rightPoint = rotatePoint(
      box.pivotX + boxGeometry.width,
      box.pivotY - boxGeometry.height / 2,
      angle
    );
    const connectorOffset = 24;
    const leftElbow = {
      x: leftPoint.x + Math.sin(radians) * connectorOffset,
      y: leftPoint.y - Math.cos(radians) * connectorOffset
    };
    const rightElbow = {
      x: rightPoint.x + Math.cos(radians) * connectorOffset,
      y: rightPoint.y + Math.sin(radians) * connectorOffset
    };
    if (mobileLayout.matches) {
      leftConnector.setAttribute('points', `${leftPoint.x.toFixed(2)},${leftPoint.y.toFixed(2)} ${leftElbow.x.toFixed(2)},${leftElbow.y.toFixed(2)} 24,${leftElbow.y.toFixed(2)} 130,355`);
      rightConnector.setAttribute('points', `${rightPoint.x.toFixed(2)},${rightPoint.y.toFixed(2)} ${rightElbow.x.toFixed(2)},${rightElbow.y.toFixed(2)} 496,${rightElbow.y.toFixed(2)} 390,355`);
    } else {
      leftConnector.setAttribute('points', `${leftPoint.x.toFixed(2)},${leftPoint.y.toFixed(2)} ${leftElbow.x.toFixed(2)},${leftElbow.y.toFixed(2)} -20,170`);
      rightConnector.setAttribute('points', `${rightPoint.x.toFixed(2)},${rightPoint.y.toFixed(2)} ${rightElbow.x.toFixed(2)},${rightElbow.y.toFixed(2)} 540,170`);
    }
    const center = rotatePoint(
      box.pivotX + boxGeometry.width / 2,
      box.pivotY - boxGeometry.height / 2,
      angle
    );
    gravityLine.setAttribute('x1', center.x.toFixed(2));
    gravityLine.setAttribute('y1', (center.y + 4).toFixed(2));
    gravityLine.setAttribute('x2', center.x.toFixed(2));
    gravityLine.setAttribute('y2', (center.y + 62).toFixed(2));
    gravityLabel.setAttribute('x', (center.x + 10).toFixed(2));
    gravityLabel.setAttribute('y', (center.y + 40).toFixed(2));
  };

  const render = () => {
    const sample = profile.samples[state.angle];
    const forces = state.margin ? sample.margin : sample.noMargin;
    const point = chartPoint(sample);

    angleOutput.value = `${sample.angle}°`;
    drawModel();
    drawCone('left', forces.left);
    drawCone('right', forces.right);
    demandGuide.setAttribute('x1', point.x.toFixed(2));
    demandGuide.setAttribute('x2', point.x.toFixed(2));
    demandPoint.setAttribute('cx', point.x.toFixed(2));
    demandPoint.setAttribute('cy', point.y.toFixed(2));

    root.classList.toggle('margin-off', !state.margin);
    toggle.setAttribute('aria-pressed', String(state.margin));
    toggleLabel.textContent = state.margin ? 'Margin on' : 'Margin off';
  };

  slider.addEventListener('input', () => {
    state.angle = Number(slider.value);
    render();
  });

  toggle.addEventListener('click', () => {
    state.margin = !state.margin;
    render();
  });

  mobileLayout.addEventListener('change', () => {
    if (profile) render();
  });

  setBoxGeometry();

  fetch('assets/data/method-planner-profiles.json?v=1')
    .then((response) => {
      if (!response.ok) throw new Error(`Planner profile request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      profile = data;
      maxDemand = Math.max(...profile.samples.map((sample) => sample.taskDemand)) * 1.08;
      slider.disabled = false;
      toggle.disabled = false;
      drawDemandCurve();
      render();
    })
    .catch(() => {
      error.hidden = false;
      slider.disabled = true;
      toggle.disabled = true;
    });
})();
