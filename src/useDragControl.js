// src/useDragControl.js

import { useEffect, useRef } from 'react';

const clampVelocity = (velocity, maxValue) => {
  return Math.max(-maxValue, Math.min(maxValue, velocity));
};

const useDragControl = ({
  enabled = true,
  viewState,
  config,
  targetViewRef,
  targetPositionRef,
  leftDragVelocityRef,
  shouldStayAtPinPositionRef,
  mouseInfluenceRef,
  setSelectedId,
  setSelectedPin,
  setIsDragging,
  clampToRadius,
  selectedId,
  selectedPin,
  hoverInfo,
  setHoverInfo,
  isDraggingRef,        // Added
  isTouchDraggingRef    // Added
}) => {
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPrevRef = useRef({ x: 0, y: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchPrevRef = useRef({ x: 0, y: 0 });
  const prevViewStateRef = useRef(null);

  useEffect(() => {
    prevViewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    if (!enabled) return;

    const handleDragMovement = (x, y, buttons) => {
        const prevX = isDraggingRef.current ? dragPrevRef.current.x : touchPrevRef.current.x;
        const prevY = isDraggingRef.current ? dragPrevRef.current.y : touchPrevRef.current.y;
        const deltaX = x - prevX;
        const deltaY = y - prevY;

        // Hide tooltip on significant drag
        if ((isDraggingRef.current || isTouchDraggingRef.current) && selectedPin) {
            const startX = isDraggingRef.current ? dragStartRef.current.x : touchStartRef.current.x;
            const startY = isDraggingRef.current ? dragStartRef.current.y : touchStartRef.current.y;
            const dragStartThreshold = 5;
            if (Math.abs(x - startX) > dragStartThreshold || Math.abs(y - startY) > dragStartThreshold) {
                setSelectedPin(null);
            }
        }
        
        // Right-click drag for pitch/bearing (mouse only)
        if (buttons === 2 && isDraggingRef.current) {
            targetViewRef.current = {
                pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
                bearing: targetViewRef.current.bearing - deltaX * 0.35
            };
        }
        // Left-click drag or touch drag
        else if (buttons === 1) { 
            targetViewRef.current = {
                ...targetViewRef.current,
                bearing: targetViewRef.current.bearing - deltaX * config.leftDragBearingSensitivity
            };

            const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
            const zoomFactor = Math.pow(2, targetPositionRef.current.zoom);
            const effectiveMoveSpeed = config.forwardMovementSpeed / zoomFactor * 100;
            const moveDistance = deltaY * effectiveMoveSpeed * 0.5;
            const newLat = targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance;
            const newLng = targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance;
            const clamped = clampToRadius(newLat, newLng);

            targetPositionRef.current = {
                ...targetPositionRef.current,
                latitude: clamped.latitude,
                longitude: clamped.longitude
            };
        }

        if (isDraggingRef.current) dragPrevRef.current = { x, y };
        if (isTouchDraggingRef.current) touchPrevRef.current = { x, y };
    };

    const commonDragEndLogic = () => {
        if (prevViewStateRef.current && viewState) {
            const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
            const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
            const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
            const pitchDelta = viewState.pitch - prevViewStateRef.current.pitch;
            const inertiaMultiplier = 1.2;
            const velocityThreshold = 0.05;
            const totalVelocity = Math.abs(bearingDelta) + Math.abs(latDelta) * 100 + Math.abs(lngDelta) * 100;

            if (totalVelocity > velocityThreshold) {
                leftDragVelocityRef.current = {
                    bearing: clampVelocity(bearingDelta * inertiaMultiplier, 8),
                    pitch: clampVelocity(pitchDelta * inertiaMultiplier, 5),
                    latitude: clampVelocity(latDelta * inertiaMultiplier, 0.1),
                    longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.1),
                    zoom: 0
                };
            }
        }
        isDraggingRef.current = false;
        isTouchDraggingRef.current = false;
        setIsDragging(false);
    };

    // Mouse event handlers
    const handleMouseDown = (e) => {
        if (e.button === 0 || e.button === 2) {
            const { latitude, longitude, pitch, bearing } = viewState;
            shouldStayAtPinPositionRef.current = false;
            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            dragPrevRef.current = { x: e.clientX, y: e.clientY };
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            targetPositionRef.current.latitude = latitude;
            targetPositionRef.current.longitude = longitude;
            targetViewRef.current = { pitch, bearing };
        }
    };

    const handleMouseUp = (e) => {
        if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
            const dx = Math.abs(e.clientX - dragStartRef.current.x);
            const dy = Math.abs(e.clientY - dragStartRef.current.y);
            if (selectedId && (dx > 5 || dy > 5)) {
                setSelectedId(null);
                setSelectedPin(null);
                if (hoverInfo) setHoverInfo(null);
            }
            commonDragEndLogic();
        }
    };

    const handleMouseMove = (e) => {
        if (isDraggingRef.current) {
            handleDragMovement(e.clientX, e.clientY, e.buttons);
        } else {
            const { innerWidth, innerHeight } = window;
            const xNorm = (e.clientX / innerWidth) * 2 - 1;
            const yNorm = (e.clientY / innerHeight) * 2 - 1;
            mouseInfluenceRef.current = { x: xNorm, y: yNorm };
        }
    };
    
    // Touch event handlers
    const handleTouchStart = (e) => {
        const target = e.target;
        if (target.closest('a, button, input')) {
            return;
        }
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const { latitude, longitude, pitch, bearing } = viewState;
            shouldStayAtPinPositionRef.current = false;
            isTouchDraggingRef.current = true;
            setIsDragging(true);
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            touchPrevRef.current = { x: touch.clientX, y: touch.clientY };
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            targetPositionRef.current.latitude = latitude;
            targetPositionRef.current.longitude = longitude;
            targetViewRef.current = { pitch, bearing };
        }
    };

    const handleTouchEnd = (e) => {
        if (isTouchDraggingRef.current && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartRef.current.x);
            const dy = Math.abs(touch.clientY - touchStartRef.current.y);
            if (selectedId && (dx > 10 || dy > 10)) {
                setSelectedId(null);
                setSelectedPin(null);
                if (hoverInfo) setHoverInfo(null);
            }
            commonDragEndLogic();
        }
    };

    const handleTouchMove = (e) => {
        if (isTouchDraggingRef.current && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            handleDragMovement(touch.clientX, touch.clientY, 1);
        }
    };

    // Attach event listeners
    const el = window;
    const preventDefaultContextMenu = (e) => e.preventDefault();

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('contextmenu', preventDefaultContextMenu);

    return () => {
        el.removeEventListener('mousedown', handleMouseDown);
        el.removeEventListener('mouseup', handleMouseUp);
        el.removeEventListener('mousemove', handleMouseMove);
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchend', handleTouchEnd);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('contextmenu', preventDefaultContextMenu);
    };

  }, [
    enabled, viewState, config, selectedId, selectedPin, hoverInfo,
    targetViewRef, targetPositionRef, leftDragVelocityRef, shouldStayAtPinPositionRef, mouseInfluenceRef,
    setSelectedId, setSelectedPin, setIsDragging, clampToRadius, setHoverInfo, isDraggingRef, isTouchDraggingRef
  ]);
};

export default useDragControl;
