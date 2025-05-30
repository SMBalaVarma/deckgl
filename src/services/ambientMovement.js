// ambientMovement.js
export class AmbientMovement {
  constructor() {
    this.mouseInfluenceRef = { x: 0, y: 0 };
    this.ambientInfluenceRef = { x: 0, y: 0 };
    this.floatingVelocityRef = { x: 0, y: 0 };
    this.mouseVelocityRef = { x: 0, y: 0 };
    this.lastMousePosRef = { x: 0, y: 0 };
    this.lastMouseTimeRef = Date.now();
    this.isEnabled = true;
  }

  // Clamp velocity to prevent sudden jumps
  clampVelocity(velocity, maxValue) {
    return Math.max(-maxValue, Math.min(maxValue, velocity));
  }

  // Enhanced interpolation with momentum preservation
  smoothInterpolate(current, target, factor, momentum = 0) {
    const diff = target - current;
    const newValue = current + diff * factor + momentum;
    return newValue;
  }

  // Update mouse tracking with velocity calculation
  updateMousePosition(x, y) {
    const currentTime = Date.now();
    
    // Calculate mouse velocity for enhanced floating effect
    const deltaTime = currentTime - this.lastMouseTimeRef;
    if (deltaTime > 0) {
      const deltaX = x - this.lastMousePosRef.x;
      const deltaY = y - this.lastMousePosRef.y;
      
      this.mouseVelocityRef.x = deltaX / deltaTime;
      this.mouseVelocityRef.y = deltaY / deltaTime;
      
      // Clamp velocity
      this.mouseVelocityRef.x = this.clampVelocity(this.mouseVelocityRef.x, 2);
      this.mouseVelocityRef.y = this.clampVelocity(this.mouseVelocityRef.y, 2);
    }
    
    this.lastMousePosRef = { x, y };
    this.lastMouseTimeRef = currentTime;
    
    if (this.isEnabled) {
      const { innerWidth, innerHeight } = window;
      const xNorm = (x / innerWidth) * 2 - 1;
      const yNorm = (y / innerHeight) * 2 - 1;
      
      this.mouseInfluenceRef = { x: xNorm, y: yNorm };
    }
  }

  // Update ambient influence based on settings
  updateAmbientInfluence(settings) {
    if (!this.isEnabled) return;

    this.ambientInfluenceRef = {
      x: this.ambientInfluenceRef.x * settings.ambientSmoothness +
         this.mouseInfluenceRef.x * settings.ambientStrength * (1 - settings.ambientSmoothness),
      y: this.ambientInfluenceRef.y * settings.ambientSmoothness +
         this.mouseInfluenceRef.y * settings.ambientStrength * (1 - settings.ambientSmoothness)
    };
  }

  // Calculate ambient movement effects
  calculateAmbientMovement(currentViewState, targetViewRef, targetPositionRef, settings, clampToRadius) {
    if (!this.isEnabled) {
      return {
        newPitch: currentViewState.pitch,
        newBearing: currentViewState.bearing,
        newLatitude: currentViewState.latitude,
        newLongitude: currentViewState.longitude,
        newZoom: currentViewState.zoom
      };
    }

    const basePitch = targetViewRef.current.pitch;
    const baseBearing = targetViewRef.current.bearing;
    const baseLatitude = targetPositionRef.current.latitude;
    const baseLongitude = targetPositionRef.current.longitude;

    const mouseInfluenceX = this.mouseInfluenceRef.x + this.mouseVelocityRef.x * settings.mouseVelocityInfluence;
    const mouseInfluenceY = this.mouseInfluenceRef.y + this.mouseVelocityRef.y * settings.mouseVelocityInfluence;

    const pitchInfluence = mouseInfluenceY * settings.ambientMaxPitch;
    const bearingInfluence = mouseInfluenceX * settings.ambientMaxBearing;
    const latInfluence = mouseInfluenceY * settings.ambientMaxLatOffset;
    const lngInfluence = mouseInfluenceX * settings.ambientMaxLngOffset;

    this.floatingVelocityRef.x += mouseInfluenceX * settings.floatingStrength;
    this.floatingVelocityRef.y += mouseInfluenceY * settings.floatingStrength;
    
    this.floatingVelocityRef.x = this.clampVelocity(this.floatingVelocityRef.x, settings.floatingMaxInfluence);
    this.floatingVelocityRef.y = this.clampVelocity(this.floatingVelocityRef.y, settings.floatingMaxInfluence);
    
    const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + pitchInfluence + this.floatingVelocityRef.y));
    const ambientTargetBearing = baseBearing + bearingInfluence + this.floatingVelocityRef.x;
    
    // Calculate ambient target position and clamp to radius
    let ambientTargetLatitude = baseLatitude + latInfluence + this.floatingVelocityRef.y * 0.001;
    let ambientTargetLongitude = baseLongitude + lngInfluence + this.floatingVelocityRef.x * 0.001;
    
    const clamped = clampToRadius(ambientTargetLatitude, ambientTargetLongitude);
    ambientTargetLatitude = clamped.latitude;
    ambientTargetLongitude = clamped.longitude;

    this.floatingVelocityRef.x *= settings.floatingDamping;
    this.floatingVelocityRef.y *= settings.floatingDamping;

    const smoothFactor = 1 - settings.ambientSmoothness;
    const newPitch = currentViewState.pitch + (ambientTargetPitch - currentViewState.pitch) * smoothFactor;
    const newBearing = currentViewState.bearing + (ambientTargetBearing - currentViewState.bearing) * smoothFactor;
    const newLatitude = currentViewState.latitude + (ambientTargetLatitude - currentViewState.latitude) * smoothFactor;
    const newLongitude = currentViewState.longitude + (ambientTargetLongitude - currentViewState.longitude) * smoothFactor;

    return {
      newPitch,
      newBearing,
      newLatitude,
      newLongitude,
      newZoom: currentViewState.zoom
    };
  }

  // Reset all velocities and influences
  reset() {
    this.mouseInfluenceRef = { x: 0, y: 0 };
    this.ambientInfluenceRef = { x: 0, y: 0 };
    this.floatingVelocityRef = { x: 0, y: 0 };
    this.mouseVelocityRef = { x: 0, y: 0 };
    this.lastMousePosRef = { x: 0, y: 0 };
    this.lastMouseTimeRef = Date.now();
  }

  // Enable/disable ambient movement
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  // Get current state for debugging
  getState() {
    return {
      mouseInfluence: this.mouseInfluenceRef,
      ambientInfluence: this.ambientInfluenceRef,
      floatingVelocity: this.floatingVelocityRef,
      mouseVelocity: this.mouseVelocityRef,
      isEnabled: this.isEnabled
    };
  }
}

export default AmbientMovement;
