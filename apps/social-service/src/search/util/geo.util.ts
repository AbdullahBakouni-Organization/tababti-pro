export class GeoUtil {
  static near(lat: number, lng: number, maxDistance = 5000) {
    if (lat === undefined || lng === undefined) return null;

    return {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    };
  }
}
