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
