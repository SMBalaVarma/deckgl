import React, { useState, useEffect, useRef } from 'react';
import DeckGL, { IconLayer, GeoJsonLayer } from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import NationalParksData from './data.json';
import mapIcon from './gold-pointer.png';
import mapRevertIcon from './map-revert.png';
import liveTrackIcon from './livetrack.png';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

const INITIAL_VIEW_STATE = {
  latitude: 33.6095571,
  longitude: -84.8039517,
  zoom: 3,
  pitch: 60,
  bearing: -30,
};

function App() {
  const [hoverInfo, setHoverInfo] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE); 
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const clickedIdRef = useRef(null);
  const pendingIdRef = useRef(null);
  const canvasRef = useRef();
  const mouseXRef = useRef(0); 
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef();
  const [zoomDuration, setZoomDuration] = useState(5000);


  // Smooth 3D motion: target pitch and bearing
  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();

  // Initial zoom-in effect
  const playInitialZoom = (duration) => {
    const finalDuration = duration ?? zoomDuration ?? 5000;
    setSelectedId(null);
    setHoverInfo(null);
    setViewState(prev => ({
      ...prev,
      longitude: INITIAL_VIEW_STATE.longitude, // Centered
      latitude: INITIAL_VIEW_STATE.latitude,  // Centered
      zoom: 14,
      pitch: 70,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator()
    }));
  };
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      playInitialZoom();
    }, 300);
    return () => clearTimeout(timeout);
  }, []); 

  // Tooltip screen position update
  useEffect(() => {
    if (hoverInfo && deckRef.current && deckRef.current.deck) {
      const viewports = deckRef.current.deck.getViewports();
      if (viewports && viewports.length > 0) {
        const viewport = viewports[0];
        const [x, y] = viewport.project([hoverInfo.longitude, hoverInfo.latitude]);
        setTooltipPos({ x, y });
      }
    } else {
      setTooltipPos(null);
    }
  }, [hoverInfo, viewState]);

  // Smooth animation loop for pitch and bearing
  useEffect(() => {
    const smoothUpdate = () => {
      setViewState(prev => {
        const currentPitch = prev.pitch;
        const currentBearing = prev.bearing;
        const targetPitch = targetViewRef.current.pitch;
        const targetBearing = targetViewRef.current.bearing;

        const smoothFactor = 0.05;
        const newPitch = currentPitch + (targetPitch - currentPitch) * smoothFactor;
        const newBearing = currentBearing + (targetBearing - currentBearing) * smoothFactor;

        return {
          ...prev,
          pitch: newPitch,
          bearing: newBearing
        };
      });

      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  // Mouse move handler to set target pitch/bearing
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const { innerWidth, innerHeight } = window;
  
      const xNorm = (x / innerWidth) * 2 - 1;
      const yNorm = (y / innerHeight) * 2 - 1;
  
      mouseInfluenceRef.current = { x: xNorm, y: yNorm };
    };
  
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const animate = () => {
      const { x, y } = mouseInfluenceRef.current;
      const translateX = x * 10; // px to shift
      const translateY = y * 10;
  
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translate(${translateX}px, ${translateY}px)`;
      }
  
      requestAnimationFrame(animate);
    };
  
    animate();
  }, []);    

  const layers = [
    new IconLayer({
      id: 'nationalParksIcons-' + selectedId,
      data: NationalParksData.features,
      pickable: true,
      getPosition: d => {
        const coords = d.geometry.coordinates;
        return Array.isArray(coords[0]) ? coords[0] : coords;
      },
      getIcon: () => ({
        url: iconUrl,
        width: 143,
        height: 143,
        anchorY: 143
      }),
      sizeScale: 7,
      getSize: d => (d.id === selectedId ? 10 : 5),
      getColor: [255, 140, 0], 
      onClick: info => {
        if (info.object) {
          const coords = info.coordinate || info.object.geometry.coordinates;
          if (!coords || coords.length < 2) return;      
          const [longitude, latitude] = coords;
          const clickedId = info.object.id;      
          pendingIdRef.current = clickedId;
      
          setHoverInfo({
            name: info.object.properties.Name,
            longitude,
            latitude
          });
      
          setViewState(prev => ({
            ...prev,
            longitude,
            latitude,
            zoom: Math.min(prev.zoom + 1, 16),
            pitch: 75,
            bearing: prev.bearing + 90,
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator(),
            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current); 
              setViewState(prev => ({
                ...prev,
                zoom: Math.min(prev.zoom + 1, 15.95),
                transitionDuration: 500
              }));             
            }            
          }));
        } else {
          setHoverInfo(null);
          setSelectedId(null);
        }
      }
             
      
    })
  ];

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100vh', transition: 'transform 0.5s ease'  }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          zIndex: 9, // Behind everything
          pointerEvents: 'none'
        }}
      />
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        controller={{ 
          dragMode: 'rotate',
          inertia: true, 
          scrollZoom: false,
          touchZoom: false,
          doubleClickZoom: false,
          keyboard: false
        }}
        layers={layers}
        onViewStateChange={({ viewState, interactionState }) => {
          setViewState(viewState);
        
          // While dragging
          if (interactionState.isDragging) {
            cancelAnimationFrame(animationFrameRef.current); // stop auto-rotation
            targetViewRef.current = {
              pitch: viewState.pitch,
              bearing: viewState.bearing
            };
          }
        
          // When drag ends
          if (!interactionState.isDragging && !animationFrameRef.current) {
            // Delay reactivation to make transition smooth
            setTimeout(() => {
              animationFrameRef.current = requestAnimationFrame(() => {
                const smoothUpdate = () => {
                  setViewState(prev => {
                    const currentPitch = prev.pitch;
                    const currentBearing = prev.bearing;
                    const targetPitch = targetViewRef.current.pitch;
                    const targetBearing = targetViewRef.current.bearing;
        
                    const smoothFactor = isMobile ? 0.01 : 0.15;
                    const newPitch = currentPitch + (targetPitch - currentPitch) * smoothFactor;
                    const newBearing = currentBearing + (targetBearing - currentBearing) * smoothFactor;
        
                    return {
                      ...prev,
                      pitch: newPitch,
                      bearing: newBearing
                    };
                  });
        
                  animationFrameRef.current = requestAnimationFrame(smoothUpdate);
                };
                smoothUpdate();
              });
            }, 300); // Add 300ms delay before resuming animation
          }
        }}
              
        onClick={info => {
          if (!info.object) {
            setHoverInfo(null);
          }
        }}        
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
        />
      </DeckGL>

      {/* Tooltip */}
      {hoverInfo && tooltipPos && (
        <div
          className="tooltip tooltip-visible tooltip-animate"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <strong>{hoverInfo.name}</strong>
          <a href='#' target='_blank' style={{ color: '#fff', display: 'block' }}>Discover</a>
        </div>
      )}
      <div className='live-back-btns'>
        <ul>
        <li><a href="#" onClick={(e) => { 
            e.preventDefault(); 
            setSelectedId(null); 
            setHoverInfo(null);
            playInitialZoom(1000); 
          }}><img src={mapRevertIcon} alt="Map" /></a></li>
          <li><a href="#" target='_blank'><img src={liveTrackIcon} alt="Live Track" /></a></li>
        </ul>
      </div>

      {/* Tooltip CSS */}
      <style>{`
        body {
          overflow:hidden;
          font-family: 'Montserrat', sans-serif;
        }
        .live-back-btns {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 9999;          
        }
        .live-back-btns ul {
          display: flex;
          gap: 25px;
        }
        .live-back-btns ul li {
          list-style: none;
          padding: 0;
          margin: 0;          
        }        
        .tooltip {
          position: absolute;          
          pointer-events: auto;
          background: rgba(255,255,255, 0.12);
          padding: 20px 38px;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transform: translate(-50%, -120%) scale(0.5);
          opacity: 0;
          transition: opacity 0.4s ease, transform 0.4s ease;
          z-index: 10;
          text-align: center;
        }
        .tooltip strong {
          color:#fff;
          font-size: 42px;
          line-height: 46px;
        }
        .tooltip a {
          font-size: 20px;
          line-height: 24px;
          color: #fff;
          text-decoration: underline;
        }
        .tooltip-visible {
          opacity: 1;
          transform: translate(-30%, -250%) scale(1);
        }
          .tooltip-animate {
          animation: fadeInUp 0.4s ease-out;
        }

        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media only screen and (max-width: 992px) {
          .tooltip {
            padding: 10px 20px;
            background: rgba(255,255,255, 0.2);
          }
          .tooltip strong {
            font-size: 30px;
            line-height: 34px;
          }
          .tooltip a {
            font-size: 16px;
            line-height: 20px;
          }
        }
        @media only screen and (max-width: 767px) {
          .tooltip strong {
            font-size: 16px;
            line-height: 20px;
          }
          .tooltip a {
            font-size: 14px;
            line-height: 18px;
          }
        }

      `}</style>
    </div>
  );
}

export default App;




import React, { useState, useEffect, useRef } from 'react';
import DeckGL, { IconLayer, GeoJsonLayer } from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import NationalParksData from './data.json';
import mapIcon from './gold-pointer.png';
import mapRevertIcon from './map-revert.png';
import liveTrackIcon from './livetrack.png';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

// Initial view state adjusted for better initial display
const INITIAL_VIEW_STATE = {
  latitude: 33.6095571,
  longitude: -84.8039517,
  zoom: 3.5,
  pitch: 60,
  bearing: -30,
  maxZoom: 20,
  minZoom: 1
};

function App() {
  const [hoverInfo, setHoverInfo] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE); 
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const clickedIdRef = useRef(null);
  const pendingIdRef = useRef(null);
  const canvasRef = useRef();
  const mouseXRef = useRef(0); 
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef();
  const [zoomDuration, setZoomDuration] = useState(5000);
  
  // Drag state tracking
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPrevRef = useRef({ x: 0, y: 0 });
  const dragVelocityRef = useRef({ x: 0, y: 0 });
  const dampenedVelocityRef = useRef({ x: 0, y: 0 });

  // Smooth 3D motion: target pitch and bearing
  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);
  const isDraggingRef = useRef(false);
  const leftDragVelocityRef = useRef({ x: 0, y: 0 });

  // NEW: Add ambient mouse movement settings
  const [ambientMovementEnabled, setAmbientMovementEnabled] = useState(true);
  const ambientInfluenceRef = useRef({ x: 0, y: 0 });

  const targetPositionRef = useRef({
    latitude: INITIAL_VIEW_STATE.latitude,
    longitude: INITIAL_VIEW_STATE.longitude
  });
  
  useEffect(() => {
    // Initialize position refs
    targetPositionRef.current = {
      latitude: INITIAL_VIEW_STATE.latitude,
      longitude: INITIAL_VIEW_STATE.longitude
    };
    
    const timeout = setTimeout(() => {
      playInitialZoom();
    }, 300);
    return () => clearTimeout(timeout);
  }, []);
  
  const positionInfluenceRef = useRef({ x: 0, y: 0 });
  
  // Fix: Initialize all smoothnessSettings properties with default values
  const [smoothnessSettings, setSmoothnessSettings] = useState({
    friction: 0.9,
    sensitivity: 1.0,
    leftDampingFactor: 0.92,  // Increased for smoother deceleration after drag
    leftDragSensitivity: 0.05, // Added control for left drag sensitivity
    leftSmoothFactor: 0.1,
    ambientStrength: 0.04,      // How strong the ambient effect is
    ambientMaxPitch: 90,         // Maximum pitch deviation from center
    ambientMaxBearing: 90,      // Maximum bearing deviation from center
    ambientSmoothness: 0.95,     // How smoothly it transitions (higher = smoother)
    ambientMaxLatOffset: 0.1, // Maximum latitude offset in degrees
    ambientMaxLngOffset: 0.1, // Maximum longitude offset in degrees
  });

  // Initial zoom-in effect
  const playInitialZoom = (duration) => {
    const finalDuration = duration ?? zoomDuration ?? 5000;
    setSelectedId(null);
    setHoverInfo(null);
    
    // Reset target position
    targetPositionRef.current = {
      latitude: INITIAL_VIEW_STATE.latitude,
      longitude: INITIAL_VIEW_STATE.longitude
    };
    
    setViewState(prev => ({
      ...prev,
      longitude: INITIAL_VIEW_STATE.longitude,
      latitude: INITIAL_VIEW_STATE.latitude,
      zoom: 14,
      pitch: 70,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator()
    }));
  };
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      playInitialZoom();
    }, 300);
    return () => clearTimeout(timeout);
  }, []); 

  // Tooltip screen position update
  useEffect(() => {
    if (hoverInfo && deckRef.current && deckRef.current.deck) {
      const viewports = deckRef.current.deck.getViewports();
      if (viewports && viewports.length > 0) {
        const viewport = viewports[0];
        const [x, y] = viewport.project([hoverInfo.longitude, hoverInfo.latitude]);
        setTooltipPos({ x, y });
      }
    } else {
      setTooltipPos(null);
    }
  }, [hoverInfo, viewState]);
    
  // Smooth animation loop for pitch, bearing, and position
  useEffect(() => {
    const smoothUpdate = () => {
      setViewState(prev => {
        const currentPitch = prev.pitch;
        const currentBearing = prev.bearing;
        const currentLatitude = prev.latitude;
        const currentLongitude = prev.longitude;
        
        // Get target values
        let targetPitch = targetViewRef.current.pitch;
        let targetBearing = targetViewRef.current.bearing;
        let targetLatitude = targetPositionRef.current.latitude;
        let targetLongitude = targetPositionRef.current.longitude;
        
        // Store current state for velocity calculation
        if (!prevViewStateRef.current) {
          prevViewStateRef.current = { 
            bearing: currentBearing, 
            pitch: currentPitch,
            latitude: currentLatitude,
            longitude: currentLongitude
          };
        }
    
        let newBearing = currentBearing;
        let newPitch = currentPitch;
        let newLatitude = currentLatitude;
        let newLongitude = currentLongitude;
      
        if (isDraggingRef.current) {
          // During left-click drag, DeckGL handles the direct movement
          // We just need to track the changes for later inertia
          const bearingDelta = currentBearing - prevViewStateRef.current.bearing;
          const pitchDelta = currentPitch - prevViewStateRef.current.pitch;
          const latDelta = currentLatitude - prevViewStateRef.current.latitude;
          const lngDelta = currentLongitude - prevViewStateRef.current.longitude;
          
          leftDragVelocityRef.current = {
            bearing: bearingDelta,
            pitch: pitchDelta,
            latitude: latDelta,
            longitude: lngDelta
          };
          
          // Update for next frame
          newBearing = currentBearing;
          newPitch = currentPitch;
          newLatitude = currentLatitude;
          newLongitude = currentLongitude;
          
          // Update target positions to match current (since user is manually dragging)
          targetPositionRef.current = {
            latitude: currentLatitude,
            longitude: currentLongitude
          };
          
          targetViewRef.current = {
            bearing: currentBearing,
            pitch: currentPitch
          };
        }
        else {
          // Not actively dragging - apply inertia or smooth return to target
          
          // First apply any left-click inertia if significant
          if (Math.abs(leftDragVelocityRef.current.bearing) > 0.001 || 
              Math.abs(leftDragVelocityRef.current.pitch) > 0.001 ||
              Math.abs(leftDragVelocityRef.current.latitude) > 0.00001 ||
              Math.abs(leftDragVelocityRef.current.longitude) > 0.00001) {
            
            // Apply inertia with damping
            newBearing = currentBearing + leftDragVelocityRef.current.bearing;
            newPitch = Math.max(0, Math.min(85, currentPitch + leftDragVelocityRef.current.pitch));
            newLatitude = currentLatitude + leftDragVelocityRef.current.latitude;
            newLongitude = currentLongitude + leftDragVelocityRef.current.longitude;
            
            // Apply progressive damping to gradually reduce velocity - smoother deceleration
            leftDragVelocityRef.current = {
              bearing: leftDragVelocityRef.current.bearing * smoothnessSettings.leftDampingFactor,
              pitch: leftDragVelocityRef.current.pitch * smoothnessSettings.leftDampingFactor,
              latitude: leftDragVelocityRef.current.latitude * smoothnessSettings.leftDampingFactor,
              longitude: leftDragVelocityRef.current.longitude * smoothnessSettings.leftDampingFactor
            };
            
            // Update the target to match our inertia-affected position
            targetViewRef.current = {
              bearing: newBearing,
              pitch: newPitch
            };
            targetPositionRef.current = {
              latitude: newLatitude,
              longitude: newLongitude
            };
          }
          // Apply ambient mouse movement if enabled and no active inertia
          else if (ambientMovementEnabled) {
            // Calculate base values (what we'd center around)
            const basePitch = targetViewRef.current.pitch;
            const baseBearing = targetViewRef.current.bearing;
            const baseLatitude = targetPositionRef.current.latitude;
            const baseLongitude = targetPositionRef.current.longitude;
            
            // Apply ambient influence based on mouse position
            // Use ambientInfluence which is smoothed over time from mouseInfluence
            const pitchInfluence = ambientInfluenceRef.current.y * smoothnessSettings.ambientMaxPitch;
            const bearingInfluence = ambientInfluenceRef.current.x * smoothnessSettings.ambientMaxBearing;
            const latInfluence = ambientInfluenceRef.current.y * smoothnessSettings.ambientMaxLatOffset;
            const lngInfluence = ambientInfluenceRef.current.x * smoothnessSettings.ambientMaxLngOffset;
            
            // Calculate new target including ambient influence
            const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + pitchInfluence));
            const ambientTargetBearing = baseBearing + bearingInfluence;
            const ambientTargetLatitude = baseLatitude + latInfluence;
            const ambientTargetLongitude = baseLongitude + lngInfluence;
            
            // Smooth transition to the new target
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = currentPitch + (ambientTargetPitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (ambientTargetBearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (ambientTargetLatitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (ambientTargetLongitude - currentLongitude) * smoothFactor;
          }
          // Finally, if no ambient and no significant inertia, smooth return to target
          else {
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = currentPitch + (targetPitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (targetBearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (targetLatitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (targetLongitude - currentLongitude) * smoothFactor;
          }
        }
        
        // Update previous state for next frame velocity calculation
        prevViewStateRef.current = { 
          bearing: currentBearing, 
          pitch: currentPitch,
          latitude: currentLatitude,
          longitude: currentLongitude
        };
        
        return {
          ...prev,
          pitch: newPitch,
          bearing: newBearing,
          latitude: newLatitude,
          longitude: newLongitude
        };
      });
    
      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isDragging, smoothnessSettings, ambientMovementEnabled]);

  // Mouse move handler to set target pitch/bearing
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const { innerWidth, innerHeight } = window;
  
      // Track mouse position for ambient effects
      // Normalize to -1 to 1 range, where (0,0) is center
      const xNorm = (x / innerWidth) * 2 - 1;
      const yNorm = (y / innerHeight) * 2 - 1;
      
      // Store raw mouse influence
      mouseInfluenceRef.current = { x: xNorm, y: yNorm };
      
      // Smoothly update ambient influence (for subtle camera movement)
      ambientInfluenceRef.current = {
        x: ambientInfluenceRef.current.x * smoothnessSettings.ambientSmoothness + 
           xNorm * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness),
        y: ambientInfluenceRef.current.y * smoothnessSettings.ambientSmoothness + 
           yNorm * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness)
      };
      
      // While dragging, calculate velocity for inertia
      if (isDragging) {
        // Calculate movement since last position
        const deltaX = x - dragPrevRef.current.x;
        const deltaY = y - dragPrevRef.current.y;
        
        // Update velocity based on movement
        dragVelocityRef.current = {
          x: deltaX * smoothnessSettings.leftDragSensitivity,
          y: deltaY * smoothnessSettings.leftDragSensitivity
        };
        
        // Apply smoothing to velocity for more natural feel
        dampenedVelocityRef.current = {
          x: dampenedVelocityRef.current.x * 0.7 + dragVelocityRef.current.x * 0.3,
          y: dampenedVelocityRef.current.y * 0.7 + dragVelocityRef.current.y * 0.3
        };
        
        // Update for next movement calculation
        dragPrevRef.current = { x, y };
      }
    };
  
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isDragging, smoothnessSettings]);

  // Handle mouse down/up events
  useEffect(() => {
    const handleMouseDown = (e) => {
      // Only handle left mouse button (button === 0)
      if (e.button === 0) { 
        // Don't set dragging state here - DeckGL will handle it
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragPrevRef.current = { x: e.clientX, y: e.clientY };
        
        // Reset velocity when starting a new drag
        dampenedVelocityRef.current = { x: 0, y: 0 };
      }
    };
    
    window.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // Add viewport meta tag for mobile devices
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
  }, []);   

  const layers = [
    new IconLayer({
      id: 'nationalParksIcons-' + selectedId,
      data: NationalParksData.features,
      pickable: true,
      getPosition: d => {
        const coords = d.geometry.coordinates;
        return Array.isArray(coords[0]) ? coords[0] : coords;
      },
      getIcon: () => ({
        url: iconUrl,
        width: 143,
        height: 143,
        anchorY: 143
      }),
      sizeScale: 7,
      getSize: d => (d.id === selectedId ? 10 : 5),
      getColor: [255, 140, 0], 
      onClick: info => {
        if (info.object) {
          const coords = info.coordinate || info.object.geometry.coordinates;
          if (!coords || coords.length < 2) return;      
          const [longitude, latitude] = coords;
          const clickedId = info.object.id;      
          pendingIdRef.current = clickedId;
      
          setHoverInfo({
            name: info.object.properties.Name,
            longitude,
            latitude
          });
      
          setViewState(prev => ({
            ...prev,
            longitude,
            latitude,
            zoom: Math.min(prev.zoom + 1, 16),
            pitch: 75,
            bearing: prev.bearing + 90,
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator(),
            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current); 
              setViewState(prev => ({
                ...prev,
                zoom: Math.min(prev.zoom + 1, 15.95),
                transitionDuration: 500
              }));             
            }            
          }));
        } else {
          setHoverInfo(null);
          setSelectedId(null);
        }
      }
    })
  ];

  return (
    <div 
      ref={wrapperRef} 
      style={{ 
        position: 'relative', 
        width: '100vw', 
        height: '100vh', 
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9, // Behind everything
          pointerEvents: 'none'
        }}
      />
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        controller={{ 
          dragMode: 'rotate',      // Keep rotate mode for the drag controls
          inertia: false,          // Disable DeckGL inertia to handle it ourselves
          scrollZoom: false,
          touchZoom: false,
          doubleClickZoom: false,
          keyboard: false
        }}
        layers={layers}
        width="100%"
        height="100%"
        style={{position: 'absolute', left: 0, top: 0, cursor: isDragging ? 'grabbing' : 'grab'}}
        onViewStateChange={({ viewState, interactionState }) => {
          setViewState(viewState);
          
          // Track dragging state for our reference and UI
          isDraggingRef.current = interactionState.isDragging;
          setIsDragging(interactionState.isDragging);
          
          // When dragging starts/continues
          if (interactionState.isDragging) {
            // Update the target position to match current drag position
            targetPositionRef.current = {
              latitude: viewState.latitude,
              longitude: viewState.longitude
            };
            
            // Update the target view for pitch/bearing
            targetViewRef.current = {
              pitch: viewState.pitch,
              bearing: viewState.bearing
            };
          }
          
          // When drag ends
          if (!interactionState.isDragging && prevViewStateRef.current) {
            // Calculate final velocities for inertial movement
            const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
            const pitchDelta = viewState.pitch - prevViewStateRef.current.pitch;
            const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
            const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
            
            // Set velocities for smooth continuation
            leftDragVelocityRef.current = {
              bearing: bearingDelta * 0.8, // Reduce initial velocity slightly for smoother transition
              pitch: pitchDelta * 0.8,
              latitude: latDelta * 0.8,
              longitude: lngDelta * 0.8
            };
            
            // Update the target position for eventual smooth return
            targetPositionRef.current = {
              latitude: viewState.latitude,
              longitude: viewState.longitude
            };
            
            // Update target view for eventual smooth return
            targetViewRef.current = {
              pitch: viewState.pitch,
              bearing: viewState.bearing
            };
          }
        }}
              
        onClick={info => {
          if (!info.object) {
            setHoverInfo(null);
          }
        }}        
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
          width="100%"
          height="100%"
        />
      </DeckGL>

      <div className="camera-controls-indicator" style={{ 
        position: 'absolute', 
        bottom: '20px', 
        left: '20px', 
        color: 'white', 
        background: 'rgba(0,0,0,0.5)', 
        padding: '10px', 
        borderRadius: '5px',
        opacity: isDragging ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}>
        Left-click drag: Camera control
      </div>

      {/* Smoothness controls (can be hidden in production) */}
      <div className="smoothness-controls" style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.7)',
        padding: '15px',
        color: 'white',
        borderRadius: '8px',
        zIndex: 1000,
        maxWidth: '300px',
        fontSize: '12px',
        display: isMobile ? 'none' : 'block' // Hide on mobile
      }}>
        <h4 style={{margin: '0 0 10px 0', fontSize: '14px'}}>Camera Smoothness Controls</h4>
        
        {/* Toggle for ambient movement */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
            <input
              type="checkbox"
              checked={ambientMovementEnabled}
              onChange={(e) => setAmbientMovementEnabled(e.target.checked)}
              style={{marginRight: '8px'}}
            />
            Enable Mouse-Based Camera Movement
          </label>
        </div>

        {/* Only show ambient controls if enabled */}
        {ambientMovementEnabled && (
          <>
            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Ambient Strength: {smoothnessSettings.ambientStrength.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.01"
                max="0.1"
                step="0.01"
                value={smoothnessSettings.ambientStrength}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientStrength: parseFloat(e.target.value)
                })}
              />
            </div>
            
            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Max Pitch Effect: {smoothnessSettings.ambientMaxPitch.toFixed(1)}°
              </label>
              <input
                type="range"
                min="1"
                max="15"
                step="0.5"
                value={smoothnessSettings.ambientMaxPitch}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientMaxPitch: parseFloat(e.target.value)
                })}
              />
            </div>
            
            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Max Bearing Effect: {smoothnessSettings.ambientMaxBearing.toFixed(1)}°
              </label>
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                value={smoothnessSettings.ambientMaxBearing}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientMaxBearing: parseFloat(e.target.value)
                })}
              />
            </div>

            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Max Latitude Offset: {smoothnessSettings.ambientMaxLatOffset.toFixed(2)}°
              </label>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.05"
                value={smoothnessSettings.ambientMaxLatOffset}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientMaxLatOffset: parseFloat(e.target.value)
                })}
              />
            </div>

            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Max Longitude Offset: {smoothnessSettings.ambientMaxLngOffset.toFixed(2)}°
              </label>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.05"
                value={smoothnessSettings.ambientMaxLngOffset}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientMaxLngOffset: parseFloat(e.target.value)
                })}
              />
            </div>

            <div style={{marginBottom: '8px'}}>
              <label style={{display: 'block', marginBottom: '2px'}}>
                Smoothness: {smoothnessSettings.ambientSmoothness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.8"
                max="0.99"
                step="0.01"
                value={smoothnessSettings.ambientSmoothness}
                onChange={(e) => setSmoothnessSettings({
                  ...smoothnessSettings,
                  ambientSmoothness: parseFloat(e.target.value)
                })}
              />
            </div>
          </>
        )}
        
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Drag Damping: {smoothnessSettings.leftDampingFactor.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.8"
            max="0.99"
            step="0.01"
            value={smoothnessSettings.leftDampingFactor}
            onChange={(e) => setSmoothnessSettings({
              ...smoothnessSettings,
              leftDampingFactor: parseFloat(e.target.value)
            })}
          />
        </div>
        
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Drag Sensitivity: {smoothnessSettings.leftDragSensitivity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.01"
            max="0.2"
            step="0.01"
            value={smoothnessSettings.leftDragSensitivity}
            onChange={(e) => setSmoothnessSettings({
              ...smoothnessSettings,
              leftDragSensitivity: parseFloat(e.target.value)
            })}
          />
        </div>
      </div>

      {/* Tooltip */}
      {hoverInfo && tooltipPos && (
        <div
          className="tooltip tooltip-visible tooltip-animate"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <strong>{hoverInfo.name}</strong>
          <a href='#' target='_blank' style={{ color: '#fff', display: 'block' }}>Discover</a>
        </div>
      )}
      <div className='live-back-btns'>
        <ul>
        <li><a href="#" onClick={(e) => { 
            e.preventDefault(); 
            setSelectedId(null); 
            setHoverInfo(null);
            playInitialZoom(1000); 
          }}><img src={mapRevertIcon} alt="Map" /></a></li>
          <li><a href="#" target='_blank'><img src={liveTrackIcon} alt="Live Track" /></a></li>
        </ul>
      </div>

      {/* Tooltip CSS */}
      <style>{`
        body, html {
          margin: 0;
          padding: 0;
          overflow: hidden;
          width: 100%;
          height: 100%;
          position: fixed; /* Add this */
        }

        #root {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: fixed; /* Add this */
        }
        .live-back-btns {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 9999;          
        }
        .live-back-btns ul {
          display: flex;
          gap: 25px;
          margin: 0;
          padding: 0;
        }
        .live-back-btns ul li {
          list-style: none;
          padding: 0;
          margin: 0;          
        }        
        .tooltip {
          position: absolute;          
          pointer-events: auto;
          background: rgba(255,255,255, 0.12);
          padding: 20px 38px;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transform: translate(-50%, -120%) scale(0.5);
          opacity: 0;
          transition: opacity 0.4s ease, transform 0.4s ease;
          z-index: 10;
          text-align: center;
        }
        .tooltip strong {
          color:#fff;
          font-size: 42px;
          line-height: 46px;
        }
        .tooltip a {
          font-size: 20px;
          line-height: 24px;
          color: #fff;
          text-decoration: underline;
        }
        .tooltip-visible {
          opacity: 1;
          transform: translate(-30%, -250%) scale(1);
        }
          .tooltip-animate {
          animation: fadeInUp 0.4s ease-out;
        }

        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media only screen and (max-width: 992px) {
          .tooltip {
            padding: 10px 20px;
            background: rgba(255,255,255, 0.2);
          }
          .tooltip strong {
            font-size: 30px;
            line-height: 34px;
          }
          .tooltip a {
            font-size: 16px;
            line-height: 20px;
          }
        }
        @media only screen and (max-width: 767px) {
          .tooltip strong {
            font-size: 16px;
            line-height: 20px;
          }
          .tooltip a {
            font-size: 14px;
            line-height: 18px;
          }
        }

      `}</style>
    </div>
  );
}

export default App;








import React, { useState, useEffect, useRef } from 'react';
import DeckGL, { IconLayer } from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import NationalParksData from './data.json';
import mapIcon from './gold-pointer.png';
import mapRevertIcon from './map-revert.png';
import liveTrackIcon from './livetrack.png';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

const INITIAL_VIEW_STATE = {
  latitude: 33.6095571,
  longitude: -84.8039517,
  zoom: 5,
  pitch: 65,
  bearing: -30,
  maxZoom: 20,
  minZoom: 1
};

function App() {
  const [hoverInfo, setHoverInfo] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const pendingIdRef = useRef(null);
  const canvasRef = useRef();
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef();
  const [zoomDuration, setZoomDuration] = useState(5000);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPrevRef = useRef({ x: 0, y: 0 });

  // Enhanced camera state management
  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);
  const isDraggingRef = useRef(false);
  const leftDragVelocityRef = useRef({ bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 });

  const [ambientMovementEnabled, setAmbientMovementEnabled] = useState(true);
  const ambientInfluenceRef = useRef({ x: 0, y: 0 });
  
  // Enhanced floating movement
  const floatingVelocityRef = useRef({ x: 0, y: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseTimeRef = useRef(Date.now());

  const targetPositionRef = useRef({
    latitude: INITIAL_VIEW_STATE.latitude,
    longitude: INITIAL_VIEW_STATE.longitude,
    zoom: INITIAL_VIEW_STATE.zoom
  });

  // Add base zoom reference for floating effect
  const baseZoomRef = useRef(INITIAL_VIEW_STATE.zoom);
  const tempZoomOffsetRef = useRef(0);
  const isZoomDraggingRef = useRef(false);

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    // Enhanced floating movement settings
    floatingStrength: 0.03,
    floatingDamping: 0.98,
    floatingMaxInfluence: 15,
    mouseVelocityInfluence: 0.01,
    
    // Enhanced drag settings
    leftDampingFactor: 0.92,
    leftDragBearingSensitivity: 0.05,
    leftSmoothFactor: 0.08,
    dragLerpFactor: 0.02,
    
    // Enhanced zoom settings - Much smaller values for floating effect
    verticalZoomSensitivity: 0.001, // Reduced from 0.008 to 0.001
    zoomFloatRange: 1, // Maximum zoom offset from base position
    zoomReturnSpeed: 0.01, // Speed to return to base zoom
    zoomDamping: 0.88,
    minZoom: 1,
    maxZoom: 15,
    
    // Enhanced ambient settings
    ambientStrength: 0.03,
    ambientMaxPitch: 0.1,
    ambientMaxBearing: 0.2,
    ambientSmoothness: 0.98,
    ambientMaxLatOffset: 0.002,
    ambientMaxLngOffset: 0.001,
    forwardMovementSpeed: 0.06,
    forwardMovementDamping: 0.94,
    
    // Smoothness enhancement
    globalSmoothness: 0.85,
    stopThreshold: 0.001
  });

  // Clamp velocity to prevent sudden jumps
  const clampVelocity = (velocity, maxValue) => {
    return Math.max(-maxValue, Math.min(maxValue, velocity));
  };

  // Enhanced interpolation with momentum preservation
  const smoothInterpolate = (current, target, factor, momentum = 0) => {
    const diff = target - current;
    const newValue = current + diff * factor + momentum;
    return newValue;
  };

  const playInitialZoom = (duration) => {
    const finalDuration = duration ?? zoomDuration ?? 5000;
    setSelectedId(null);
    setHoverInfo(null);

    targetPositionRef.current = {
      latitude: INITIAL_VIEW_STATE.latitude,
      longitude: INITIAL_VIEW_STATE.longitude,
      zoom: INITIAL_VIEW_STATE.zoom
    };
    targetViewRef.current = {
        pitch: INITIAL_VIEW_STATE.pitch,
        bearing: INITIAL_VIEW_STATE.bearing
    };
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };
    
    // Reset zoom references
    baseZoomRef.current = INITIAL_VIEW_STATE.zoom;
    tempZoomOffsetRef.current = 0;
    isZoomDraggingRef.current = false;

    setViewState(prev => ({
      ...INITIAL_VIEW_STATE,
      zoom: 14,
      pitch: 80,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator()
    }));
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      playInitialZoom();
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (hoverInfo && deckRef.current && deckRef.current.deck) {
      const viewports = deckRef.current.deck.getViewports();
      if (viewports && viewports.length > 0) {
        const viewport = viewports[0];
        const [x, y] = viewport.project([hoverInfo.longitude, hoverInfo.latitude]);
        setTooltipPos({ x, y });
      }
    } else {
      setTooltipPos(null);
    }
  }, [hoverInfo, viewState]);

  // Enhanced smooth camera updates
  useEffect(() => {
    const smoothUpdate = () => {
      // Check if tab is hidden to save resources
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdate);
        return;
      }

      setViewState(prev => {
        const currentPitch = prev.pitch;
        const currentBearing = prev.bearing;
        const currentLatitude = prev.latitude;
        const currentLongitude = prev.longitude;
        const currentZoom = prev.zoom;

        prevViewStateRef.current = {
          pitch: currentPitch,
          bearing: currentBearing,
          latitude: currentLatitude,
          longitude: currentLongitude,
          zoom: currentZoom
        };

        let newPitch = currentPitch;
        let newBearing = currentBearing;
        let newLatitude = currentLatitude;
        let newLongitude = currentLongitude;
        let newZoom = currentZoom;

        if (isDraggingRef.current) {
          // Enhanced drag interpolation with momentum
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);
          
          // Handle floating zoom effect during drag
          if (isZoomDraggingRef.current) {
            const targetZoom = baseZoomRef.current + tempZoomOffsetRef.current;
            newZoom = smoothInterpolate(currentZoom, targetZoom, smoothnessSettings.dragLerpFactor);
          } else {
            newZoom = smoothInterpolate(currentZoom, targetPositionRef.current.zoom, smoothnessSettings.dragLerpFactor);
          }
        } else {
          // Enhanced inertia with better damping and zoom support
          if (Math.abs(leftDragVelocityRef.current.bearing) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.pitch) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.latitude) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.longitude) > smoothnessSettings.stopThreshold ||
              Math.abs(tempZoomOffsetRef.current) > smoothnessSettings.stopThreshold) {
            
            newBearing = currentBearing + leftDragVelocityRef.current.bearing;
            newPitch = Math.max(0, Math.min(85, currentPitch + leftDragVelocityRef.current.pitch));
            newLatitude = currentLatitude + leftDragVelocityRef.current.latitude;
            newLongitude = currentLongitude + leftDragVelocityRef.current.longitude;

            // Floating zoom return effect - smoothly return to base zoom
            if (!isZoomDraggingRef.current && Math.abs(tempZoomOffsetRef.current) > smoothnessSettings.stopThreshold) {
              tempZoomOffsetRef.current *= (1 - smoothnessSettings.zoomReturnSpeed);
            }
            newZoom = Math.max(smoothnessSettings.minZoom, Math.min(smoothnessSettings.maxZoom, baseZoomRef.current + tempZoomOffsetRef.current));

            // Enhanced damping with different rates for different properties
            leftDragVelocityRef.current = {
              bearing: leftDragVelocityRef.current.bearing * smoothnessSettings.leftDampingFactor,
              pitch: leftDragVelocityRef.current.pitch * smoothnessSettings.leftDampingFactor,
              latitude: leftDragVelocityRef.current.latitude * smoothnessSettings.leftDampingFactor,
              longitude: leftDragVelocityRef.current.longitude * smoothnessSettings.leftDampingFactor,
              zoom: 0 // No zoom velocity for floating effect
            };
            
            targetViewRef.current = { pitch: newPitch, bearing: newBearing };
            targetPositionRef.current = { latitude: newLatitude, longitude: newLongitude, zoom: newZoom };

          } else if (ambientMovementEnabled) {
            // Enhanced ambient movement with floating effect
            const basePitch = targetViewRef.current.pitch;
            const baseBearing = targetViewRef.current.bearing;
            const baseLatitude = targetPositionRef.current.latitude;
            const baseLongitude = targetPositionRef.current.longitude;

            // Enhanced floating movement with mouse velocity influence
            const mouseInfluenceX = mouseInfluenceRef.current.x + mouseVelocityRef.current.x * smoothnessSettings.mouseVelocityInfluence;
            const mouseInfluenceY = mouseInfluenceRef.current.y + mouseVelocityRef.current.y * smoothnessSettings.mouseVelocityInfluence;

            const pitchInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxPitch;
            const bearingInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxBearing;
            const latInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxLatOffset;
            const lngInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxLngOffset;

            // Add floating velocity for more dynamic movement
            floatingVelocityRef.current.x += mouseInfluenceX * smoothnessSettings.floatingStrength;
            floatingVelocityRef.current.y += mouseInfluenceY * smoothnessSettings.floatingStrength;
            
            // Clamp floating velocity
            floatingVelocityRef.current.x = clampVelocity(floatingVelocityRef.current.x, smoothnessSettings.floatingMaxInfluence);
            floatingVelocityRef.current.y = clampVelocity(floatingVelocityRef.current.y, smoothnessSettings.floatingMaxInfluence);
            
            // Apply floating velocity to movement
            const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + pitchInfluence + floatingVelocityRef.current.y));
            const ambientTargetBearing = baseBearing + bearingInfluence + floatingVelocityRef.current.x;
            const ambientTargetLatitude = baseLatitude + latInfluence + floatingVelocityRef.current.y * 0.001;
            const ambientTargetLongitude = baseLongitude + lngInfluence + floatingVelocityRef.current.x * 0.001;

            // Dampen floating velocity
            floatingVelocityRef.current.x *= smoothnessSettings.floatingDamping;
            floatingVelocityRef.current.y *= smoothnessSettings.floatingDamping;

            const smoothFactor = 1 - smoothnessSettings.ambientSmoothness;
            newPitch = currentPitch + (ambientTargetPitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (ambientTargetBearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (ambientTargetLatitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (ambientTargetLongitude - currentLongitude) * smoothFactor;
          } else {
            // Standard smooth interpolation
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (targetPositionRef.current.latitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (targetPositionRef.current.longitude - currentLongitude) * smoothFactor;
            newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * smoothFactor;
          }
        }
        
        newPitch = Math.max(0, Math.min(85, newPitch));
        newZoom = Math.max(smoothnessSettings.minZoom, Math.min(smoothnessSettings.maxZoom, newZoom));

        return {
          ...prev,
          pitch: newPitch,
          bearing: newBearing,
          latitude: newLatitude,
          longitude: newLongitude,
          zoom: newZoom,
          transitionDuration: 0
        };
      });

      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [smoothnessSettings, ambientMovementEnabled]);

  // Enhanced mouse movement tracking with velocity calculation
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const currentTime = Date.now();
      
      // Calculate mouse velocity for enhanced floating effect
      const deltaTime = currentTime - lastMouseTimeRef.current;
      if (deltaTime > 0) {
        const deltaX = x - lastMousePosRef.current.x;
        const deltaY = y - lastMousePosRef.current.y;
        
        mouseVelocityRef.current.x = deltaX / deltaTime;
        mouseVelocityRef.current.y = deltaY / deltaTime;
        
        // Clamp velocity
        mouseVelocityRef.current.x = clampVelocity(mouseVelocityRef.current.x, 2);
        mouseVelocityRef.current.y = clampVelocity(mouseVelocityRef.current.y, 2);
      }
      
      lastMousePosRef.current = { x, y };
      lastMouseTimeRef.current = currentTime;
      
      if (ambientMovementEnabled && !isDraggingRef.current) {
        const { innerWidth, innerHeight } = window;
        const xNorm = (x / innerWidth) * 2 - 1;
        const yNorm = (y / innerHeight) * 2 - 1;
        
        mouseInfluenceRef.current = { x: xNorm, y: yNorm };
        
        // Enhanced ambient calculation with floating effect
        ambientInfluenceRef.current = {
          x: ambientInfluenceRef.current.x * smoothnessSettings.ambientSmoothness +
             mouseInfluenceRef.current.x * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness),
          y: ambientInfluenceRef.current.y * smoothnessSettings.ambientSmoothness +
             mouseInfluenceRef.current.y * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness)
        };
      }

      if (isDraggingRef.current) {
        const deltaX = x - dragPrevRef.current.x;
        const deltaY = y - dragPrevRef.current.y;

        if (e.buttons === 2) { // Right-click drag for pitch/bearing
          targetViewRef.current = {
            pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
            bearing: targetViewRef.current.bearing - deltaX * 0.35
          };
        } else if (e.buttons === 1) { // Left-click drag for rotate, forward/backward, and floating zoom
          // Horizontal movement controls rotation (bearing)
          targetViewRef.current = {
            ...targetViewRef.current,
            bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity
          };

          // Enhanced floating zoom control with vertical drag
          isZoomDraggingRef.current = true;
          const zoomDelta = deltaY * smoothnessSettings.verticalZoomSensitivity;
          
          // Update temporary zoom offset instead of actual zoom
          tempZoomOffsetRef.current += zoomDelta;
          
          // Clamp the offset to the float range
          tempZoomOffsetRef.current = Math.max(
            -smoothnessSettings.zoomFloatRange, 
            Math.min(smoothnessSettings.zoomFloatRange, tempZoomOffsetRef.current)
          );

          // Enhanced forward/backward movement based on bearing
          const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
          const zoomFactor = Math.pow(2, viewState.zoom); 
          const effectiveMoveSpeed = smoothnessSettings.forwardMovementSpeed / zoomFactor * 100;

          const moveDistance = deltaY * effectiveMoveSpeed * 0.5; // Reduced for smoother movement

          targetPositionRef.current = {
            ...targetPositionRef.current,
            latitude: targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance,
            longitude: targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance
          };
        }
        dragPrevRef.current = { x, y };
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [smoothnessSettings, viewState.zoom, ambientMovementEnabled]);

  // Enhanced mouse event handling
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (e.button === 0 || e.button === 2) {
        isDraggingRef.current = true;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragPrevRef.current = { x: e.clientX, y: e.clientY };
        leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
        floatingVelocityRef.current = { x: 0, y: 0 }; // Reset floating velocity on drag start
        
        // Set base zoom when starting drag
        if (e.button === 0) { // Left mouse button
          baseZoomRef.current = viewState.zoom;
          tempZoomOffsetRef.current = 0;
          isZoomDraggingRef.current = false;
        }
      }
    };

    const handleMouseUp = (e) => {
      if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
        if (prevViewStateRef.current && viewState) {
          const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
          const pitchDelta = viewState.pitch - prevViewStateRef.current.pitch;
          const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
          const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
          
          const inertiaMultiplier = 1.2; // Increased for more momentum

          // Clamp velocities to prevent sudden jumps (no zoom velocity for floating effect)
          leftDragVelocityRef.current = {
            bearing: clampVelocity(bearingDelta * inertiaMultiplier, 8),
            pitch: clampVelocity(pitchDelta * inertiaMultiplier, 5),
            latitude: clampVelocity(latDelta * inertiaMultiplier, 0.1),
            longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.1),
            zoom: 0 // No zoom velocity - let floating effect handle zoom return
          };
        }
        
        isDraggingRef.current = false;
        setIsDragging(false);
        isZoomDraggingRef.current = false; // Release zoom drag

        targetPositionRef.current = {
            latitude: viewState.latitude,
            longitude: viewState.longitude,
            zoom: viewState.zoom
        };
        targetViewRef.current = {
            pitch: viewState.pitch,
            bearing: viewState.bearing,
        };
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    const preventDefaultContextMenu = (e) => e.preventDefault();
    window.addEventListener('contextmenu', preventDefaultContextMenu);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', preventDefaultContextMenu);
    };
  }, [viewState, smoothnessSettings.leftDampingFactor]);

  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
  }, []);

  const layers = [
    new IconLayer({
      id: 'nationalParksIcons-' + selectedId,
      data: NationalParksData.features,
      pickable: true,
      getPosition: d => {
        const coords = d.geometry.coordinates;
        return Array.isArray(coords[0]) ? coords[0] : coords;
      },
      getIcon: () => ({
        url: iconUrl,
        width: 143,
        height: 143,
        anchorY: 143
      }),
      sizeScale: 7,
      getSize: d => (d.id === selectedId ? 10 : 5),
      getColor: [255, 140, 0],
      onClick: info => {
        if (info.object) {
          const coords = info.coordinate || info.object.geometry.coordinates;
          if (!coords || coords.length < 2) return;
          const [longitude, latitude] = coords;
          const clickedId = info.object.id;
          pendingIdRef.current = clickedId;

          setHoverInfo({
            name: info.object.properties.Name,
            longitude,
            latitude
          });
          
          targetPositionRef.current = { latitude, longitude, zoom: Math.min(viewState.zoom + 1, 16) };
          targetViewRef.current = { pitch: 75, bearing: viewState.bearing + 90 };
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          floatingVelocityRef.current = { x: 0, y: 0 };
          
          // Reset zoom references for floating effect
          baseZoomRef.current = Math.min(viewState.zoom + 1, 16);
          tempZoomOffsetRef.current = 0;
          isZoomDraggingRef.current = false;

          setViewState(prev => ({
            ...prev,
            longitude,
            latitude,
            zoom: Math.min(prev.zoom + 1, 16),
            pitch: 75,
            bearing: prev.bearing + 90,
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator(),
            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current);
              setViewState(curr => ({ ...curr, zoom: Math.min(curr.zoom, 15.95) }));
            }
          }));
        }
      }
    })
  ];

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: -1, pointerEvents: 'none'
        }}
      />
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        controller={{
            dragPan: false, dragRotate: false, scrollZoom: true, touchZoom: true,
            touchRotate: true, doubleClickZoom: true, keyboard: false, inertia: false
        }}
        layers={layers}
        width="100%"
        height="100%"
        style={{ position: 'absolute', left: 0, top: 0 }}
        onViewStateChange={({ viewState: newDeckViewState, interactionState }) => {
           if (!interactionState.inTransition && !isDraggingRef.current) {
             setViewState(newDeckViewState);
             targetPositionRef.current = {
                 latitude: newDeckViewState.latitude,
                 longitude: newDeckViewState.longitude,
                 zoom: newDeckViewState.zoom
             };
             targetViewRef.current = {
                 pitch: newDeckViewState.pitch,
                 bearing: newDeckViewState.bearing,
             };
           } else if (interactionState.inTransition) {
             setViewState(newDeckViewState);
           }
        }}
        onClick={info => {
          if (!info.object) {
            // Optional: clear hover/selection on map click
            // setHoverInfo(null);
            // setSelectedId(null);
          }
        }}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
          width="100%"
          height="100%"
        />
      </DeckGL>

      <div className="smoothness-controls" style={{
        position: 'absolute', bottom: '80px', right: '20px', background: 'rgba(0,0,0,0.8)',
        padding: '15px', color: 'white', borderRadius: '8px', zIndex: 1000,
        maxWidth: '320px', fontSize: '12px', display: isMobile ? 'none' : 'block',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Enhanced Camera Controls</h4>
        
        {/* Floating Movement Controls */}
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

        {/* Enhanced Drag Controls */}
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

        {/* Enhanced Zoom Controls */}
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#98fb98' }}>Floating Zoom Controls</h5>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Zoom Sensitivity: {smoothnessSettings.verticalZoomSensitivity.toFixed(3)}
            </label>
            <input
              type="range"
              min="0.0005"
              max="0.005"
              step="0.0005"
              value={smoothnessSettings.verticalZoomSensitivity}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, verticalZoomSensitivity: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Float Range: ±{smoothnessSettings.zoomFloatRange.toFixed(1)}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={smoothnessSettings.zoomFloatRange}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, zoomFloatRange: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Return Speed: {smoothnessSettings.zoomReturnSpeed.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.05"
              value={smoothnessSettings.zoomReturnSpeed}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, zoomReturnSpeed: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Min Zoom: {smoothnessSettings.minZoom}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={smoothnessSettings.minZoom}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, minZoom: parseInt(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
                        <label style={{display: 'block', marginBottom: '2px'}}>
              Max Zoom: {smoothnessSettings.maxZoom}
            </label>
            <input
              type="range"
              min="15"
              max="22"
              step="1"
              value={smoothnessSettings.maxZoom}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, maxZoom: parseInt(e.target.value) }))}
            />
          </div>
          <div style={{fontSize: '11px', color: '#ccc', marginTop: '8px'}}>
            Current: Base {baseZoomRef.current.toFixed(1)} + Offset {tempZoomOffsetRef.current.toFixed(2)} = {(baseZoomRef.current + tempZoomOffsetRef.current).toFixed(1)}
          </div>
        </div>

        {/* Forward Movement */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Forward Movement Speed: {smoothnessSettings.forwardMovementSpeed.toExponential(1)}
          </label>
          <input type="range" min="0.001" max="0.02" step="0.001"
            value={smoothnessSettings.forwardMovementSpeed}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementSpeed: parseFloat(e.target.value) }))}
          />
        </div>

        {/* Ambient Movement Toggle */}
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
              <label>Max Pitch Effect: {smoothnessSettings.ambientMaxPitch.toFixed(0.1)}°</label>
              <input type="range" min="0.1" max="2" step="0.1" value={smoothnessSettings.ambientMaxPitch}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxPitch: parseFloat(e.target.value) }))} />
            </div>
            <div style={{marginBottom: '6px'}}>
              <label>Max Bearing Effect: {smoothnessSettings.ambientMaxBearing.toFixed(0.1)}°</label>
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

        {/* Manual Camera Controls */}
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
                setViewState(prev => ({ ...prev, zoom: newZoom }));
                targetPositionRef.current.zoom = newZoom;
              }}
            />
          </div>
        </div>

        {/* Global Settings */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Global Smoothness: {smoothnessSettings.globalSmoothness.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.7"
            max="0.95"
            step="0.05"
            value={smoothnessSettings.globalSmoothness}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, globalSmoothness: parseFloat(e.target.value) }))}
          />
        </div>

        {/* Reset Button */}
        <button 
          onClick={() => setSmoothnessSettings({
            floatingStrength: 0.08,
            floatingDamping: 0.94,
            floatingMaxInfluence: 15,
            mouseVelocityInfluence: 0.3,
            leftDampingFactor: 0.92,
            leftDragBearingSensitivity: 0.12,
            leftSmoothFactor: 0.08,
            dragLerpFactor: 0.12,
            verticalZoomSensitivity: 0.008,
            zoomDamping: 0.88,
            minZoom: 1,
            maxZoom: 18,
            ambientStrength: 0.06,
            ambientMaxPitch: 8,
            ambientMaxBearing: 12,
            ambientSmoothness: 0.96,
            ambientMaxLatOffset: 0.008,
            ambientMaxLngOffset: 0.008,
            forwardMovementSpeed: 0.006,
            forwardMovementDamping: 0.94,
            globalSmoothness: 0.85,
            stopThreshold: 0.001
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

      {hoverInfo && tooltipPos && (
        <div
          className="tooltip tooltip-visible tooltip-animate"
          style={{
            position: 'absolute',
            top: tooltipPos.y, 
            left: tooltipPos.x,
            transform: 'translate(-50%, -120%)', 
            zIndex: 1001
          }}
        >
          <strong>{hoverInfo.name}</strong>
          <a href='#' target='_blank' rel="noopener noreferrer" style={{ color: '#fff', display: 'block' }}>Discover</a>
        </div>
      )}
      
      <div className='live-back-btns'>
        <ul>
          <li><a href="#" onClick={(e) => {
            e.preventDefault();
            playInitialZoom(1000);
          }}><img src={mapRevertIcon} alt="Map" /></a></li>
          <li><a href="#" target='_blank'  rel="noopener noreferrer"><img src={liveTrackIcon} alt="Live Track" /></a></li>
        </ul>
      </div>

      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; position: fixed; }
        #root { width: 100%; height: 100%; overflow: hidden; position: fixed; }
        .live-back-btns { position: absolute; top: 20px; right: 20px; z-index: 9999; }
        .live-back-btns ul { display: flex; gap: 25px; margin: 0; padding: 0; list-style: none; }
        .smoothness-controls::-webkit-scrollbar { width: 6px; }
        .smoothness-controls::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        .tooltip {
          background: rgba(0,0,0, 0.6);
          padding: 15px 25px;
          border-radius: 8px;
          box-shadow: 0 6px 15px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transition: opacity 0.3s ease-out, transform 0.3s ease-out;
          z-index: 1001;
          text-align: center;
          color: white;
        }
        .tooltip strong { font-size: 28px; line-height: 32px; display: block; margin-bottom: 5px; }
        .tooltip a { font-size: 16px; line-height: 20px; color: #eee; text-decoration: underline; }
        .tooltip-visible { opacity: 1; transform: translate(-50%, -120%) scale(1); }
        .tooltip-animate { animation: fadeInUpTooltip 0.3s ease-out; }
        @keyframes fadeInUpTooltip {
          0% { opacity: 0; transform: translate(-50%, -110%) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%, -120%) scale(1); }
        }
        @media only screen and (max-width: 992px) {
          .tooltip strong { font-size: 22px; line-height: 26px; }
          .tooltip a { font-size: 14px; line-height: 18px; }
          .tooltip { padding: 10px 15px; }
        }
        @media only screen and (max-width: 767px) {
          .tooltip strong { font-size: 18px; line-height: 22px; }
          .tooltip a { font-size: 12px; line-height: 16px; }
        }
      `}</style>
    </div>
  );
}

export default App;