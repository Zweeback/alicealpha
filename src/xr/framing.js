const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

export function calculatePerspectiveFrame({
  viewportWidth,
  viewportHeight,
  verticalFovDegrees,
  boundsWidth,
  boundsHeight,
  boundsDepth = 0,
  padding = 1.18,
  minimumDistance = 0,
}) {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const height = Math.max(1, Number(viewportHeight) || 1);
  const aspect = width / height;
  const verticalFov = degreesToRadians(verticalFovDegrees);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const paddedWidth = Math.max(0.001, boundsWidth * padding);
  const paddedHeight = Math.max(0.001, boundsHeight * padding);
  const depthAllowance = Math.max(0, boundsDepth) / 2;

  const verticalDistance = paddedHeight / (2 * Math.tan(verticalFov / 2));
  const horizontalDistance = paddedWidth / (2 * Math.tan(horizontalFov / 2));

  return {
    aspect,
    distance: Math.max(minimumDistance, verticalDistance, horizontalDistance) + depthAllowance,
    limitingAxis: verticalDistance >= horizontalDistance ? 'vertical' : 'horizontal',
  };
}
