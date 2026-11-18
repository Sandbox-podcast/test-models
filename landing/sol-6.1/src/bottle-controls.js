/** Horizontal dragging leaves native vertical touch scrolling available. */
export function attachBottleControls(button, { rotate, reset, getWidth }) {
  let gesture;
  let suppressClick = false;

  function finish(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const id = gesture.id;
    gesture = undefined;
    button.classList.remove('is-dragging');
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }

  button.addEventListener('pointerdown', event => {
    if (button.disabled || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, width: Math.max(100, getWidth()), moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const horizontal = Math.abs(event.clientX - gesture.startX);
    const vertical = Math.abs(event.clientY - gesture.startY);
    if (!gesture.moved && (horizontal < 5 || horizontal < vertical)) return;
    gesture.moved = true;
    suppressClick = true;
    button.classList.add('is-dragging');
    rotate((event.clientX - gesture.lastX) / gesture.width * Math.PI * 1.5);
    gesture.lastX = event.clientX;
  });
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('lostpointercapture', finish);
  button.addEventListener('click', event => {
    // Keyboard/assistive activations have detail=0 and remain available after dragging.
    if (event.detail && suppressClick) { suppressClick = false; return; }
    rotate(Math.PI / 4);
  });
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); rotate((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 12);
    } else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault(); reset();
    }
  });
}
