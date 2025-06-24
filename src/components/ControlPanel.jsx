import React from 'react';
import { isMobile } from 'react-device-detect';
import mapRevertIcon from '../map-revert.png';
import liveTrackIcon from '../livetrack.png';

export const ControlPanel = ({
  smoothnessSettings,
  setSmoothnessSettings,
  viewState,
  setViewState,
  ambientMovementEnabled,
  setAmbientMovementEnabled,
  targetViewRef,
  targetPositionRef,
  baseZoomRef,
  isManualZoomRef,
  onRevert
}) => {
  const [pitchSmoothness, setPitchSmoothness] = React.useState(0.05);

  return (
    <>
      {/* Settings Panel */}
      <div className="smoothness-controls" style={{
        position: 'absolute', bottom: '80px', right: '20px', background: 'rgba(0,0,0,0.8)',
        padding: '15px', color: 'white', borderRadius: '8px', zIndex: 1000,
        maxWidth: '320px', fontSize: '12px', display: isMobile ? 'none' : 'block',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Enhanced Camera Controls</h4>
        
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffd700' }}>Floating Movement</h5>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Floating Strength: {smoothnessSettings.floatingStrength.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={smoothnessSettings.floatingStrength}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingStrength: parseFloat(e.target.value) }))}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Floating Damping: {smoothnessSettings.floatingDamping.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.85"
              max="0.98"
              step="0.01"
              value={smoothnessSettings.floatingDamping}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingDamping: parseFloat(e.target.value) }))}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Mouse Velocity Influence: {smoothnessSettings.mouseVelocityInfluence.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={smoothnessSettings.mouseVelocityInfluence}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, mouseVelocityInfluence: parseFloat(e.target.value) }))}
            />
          </div>
        </div>

        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#87ceeb' }}>Drag Controls</h5>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Rotation Sensitivity: {smoothnessSettings.leftDragBearingSensitivity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.01"
              value={smoothnessSettings.leftDragBearingSensitivity}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDragBearingSensitivity: parseFloat(e.target.value) }))}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Drag Smoothness: {smoothnessSettings.dragLerpFactor.toFixed(2)}
            </label>
            <input type="range" min="0.05" max="0.3" step="0.01"
              value={smoothnessSettings.dragLerpFactor}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, dragLerpFactor: parseFloat(e.target.value) }))}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Inertia Damping: {smoothnessSettings.leftDampingFactor.toFixed(2)}
            </label>
            <input type="range" min="0.8" max="0.98" step="0.01"
              value={smoothnessSettings.leftDampingFactor}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDampingFactor: parseFloat(e.target.value) }))}
            />
          </div>
        </div>

        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Forward Movement Speed: {smoothnessSettings.forwardMovementSpeed.toExponential(1)}
          </label>
          <input type="range" min="0.001" max="0.02" step="0.001"
            value={smoothnessSettings.forwardMovementSpeed}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementSpeed: parseFloat(e.target.value) }))}
          />
        </div>

        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
            <input type="checkbox" checked={ambientMovementEnabled}
              onChange={(e) => setAmbientMovementEnabled(e.target.checked)} style={{marginRight: '8px'}}
            /> Enable Enhanced Ambient Movement
          </label>
        </div>

        {ambientMovementEnabled && (
          <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#dda0dd' }}>Ambient Settings</h5>
            
            <div style={{marginBottom: '6px'}}>
              <label>Ambient Strength: {smoothnessSettings.ambientStrength.toFixed(2)}</label>
              <input type="range" min="0.01" max="0.15" step="0.01" value={smoothnessSettings.ambientStrength}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientStrength: parseFloat(e.target.value) }))} />
            </div>
            
            <div style={{marginBottom: '6px'}}>
              <label>Max Pitch Effect: {smoothnessSettings.ambientMaxPitch.toFixed(1)}°</label>
              <input type="range" min="0.1" max="2" step="0.1" value={smoothnessSettings.ambientMaxPitch}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxPitch: parseFloat(e.target.value) }))} />
            </div>
            
            <div style={{marginBottom: '6px'}}>
              <label>Max Bearing Effect: {smoothnessSettings.ambientMaxBearing.toFixed(1)}°</label>
              <input type="range" min="0.1" max="3" step="0.1" value={smoothnessSettings.ambientMaxBearing}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxBearing: parseFloat(e.target.value) }))} />
            </div>
            
            <div style={{marginBottom: '6px'}}>
              <label>Ambient Smoothness: {smoothnessSettings.ambientSmoothness.toFixed(2)}</label>
              <input type="range" min="0.85" max="0.99" step="0.01" value={smoothnessSettings.ambientSmoothness}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientSmoothness: parseFloat(e.target.value) }))} />
            </div>
          </div>
        )}

        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffa500' }}>Manual Controls</h5>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Camera Pitch: {viewState.pitch.toFixed(1)}°
            </label>
            <input
              type="range"
              min="0"
              max="85"
              step="1"
              value={viewState.pitch}
              onChange={(e) => {
                const newPitch = parseFloat(e.target.value);
                setViewState(prev => ({ ...prev, pitch: newPitch }));
                targetViewRef.current.pitch = newPitch;
              }}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Camera Bearing: {viewState.bearing.toFixed(1)}°
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={viewState.bearing}
              onChange={(e) => {
                const newBearing = parseFloat(e.target.value);
                setViewState(prev => ({ ...prev, bearing: newBearing }));
                targetViewRef.current.bearing = newBearing;
              }}
            />
          </div>
          
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Zoom Level: {viewState.zoom.toFixed(1)}
            </label>
            <input
              type="range"
              min={smoothnessSettings.minZoom}
              max={smoothnessSettings.maxZoom}
              step="0.1"
              value={viewState.zoom}
              onChange={(e) => {
                const newZoom = parseFloat(e.target.value);
                isManualZoomRef.current = true; 
                setViewState(prev => ({ ...prev, zoom: newZoom }));
                targetPositionRef.current.zoom = newZoom;
                baseZoomRef.current = newZoom; 
                setTimeout(() => {
                  isManualZoomRef.current = false;
                }, 100);
              }}
            />
          </div>
        </div>

        <button 
          onClick={() => setSmoothnessSettings({
            floatingStrength: 0.03,
            floatingDamping: 0.98,
            floatingMaxInfluence: 15,
            mouseVelocityInfluence: 0.01,
            rotationSpeedMinZoom: 13.5,
            rotationSpeedMaxZoom: 16,
            rotationSpeedAtMinZoom: isMobile ? 0.09 : 0.08,
            rotationSpeedAtMaxZoom: isMobile ? 0.15 : 0.12,
            leftDampingFactor: isMobile ? 0.90 : 0.95,
            leftDragBearingSensitivity: isMobile ? 0.15 : 0.10,
            leftSmoothFactor: 0.15,
            dragLerpFactor: 0.15,
            verticalZoomSensitivity: 0.001,
            zoomFloatRange: 1,
            zoomReturnSpeed: 0.1,
            zoomReturnDamping: 0.85,
            zoomReturnCurve: 2.0,
            zoomDamping: 0.88,
            minZoom: 11,
            maxZoom: 16,
            ambientStrength: 0.5,
            ambientMaxPitch: 1.5,
            ambientMaxBearing: 2.5,
            ambientSmoothness: 0.92,
            ambientMaxPitchOffset: 0.0005,
            ambientMaxBearingOffset: 0.0010,
            ambientMaxLatOffset: 0.0001,
            ambientMaxLngOffset: 0.0001,
            forwardSpeedMinZoom: 13.5,
            forwardSpeedMaxZoom: 16,
            forwardSpeedAtMinZoom: isMobile ? 0.01 : 0.012,
            forwardSpeedAtMaxZoom: isMobile ? 0.026 : 0.035,
            forwardMovementSpeed: isMobile ? 0.05 : 0.04,
            forwardMovementDamping: 0.94,
            globalSmoothness: 0.85,
            stopThreshold: 0.001,
            boundaryBounceFactor: 0.3,
            boundaryResistance: 0.8,
            dynamicPitchEnabled: true,
            minPitchValue: 60,
            maxPitchValue: 60,
            pitchZoomThresholdLow: 11,
            pitchZoomThresholdHigh: 15,
          })}
          style={{
            width: '100%',
            padding: '8px',
            background: '#444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Reset to Defaults
        </button>
      </div>

      {/* Navigation Buttons */}
      <div className='live-back-btns'>
        <ul>
          <li>
            <a
              href="#" 
              style={{ display: 'block', width: '50px', height: '50px'}}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRevert();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRevert();
              }}
            >
              <img
                src={mapRevertIcon}
                alt="Map Revert"
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              />
            </a>
          </li>
          <li>
            <a href="#" target='_blank' rel="noopener noreferrer">
              <img src={liveTrackIcon} alt="Live Track" />
            </a>
          </li>
        </ul>
      </div>
    </>
  );
};
