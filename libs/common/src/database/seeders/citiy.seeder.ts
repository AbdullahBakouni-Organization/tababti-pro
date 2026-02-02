import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { DatabaseModule } from '../database.module';
import {
  City,
  DamascusAreas,
  AleppoAreas,
  LatakiaAreas,
  HassakehAreas,
  RuralDamascusAreas,
  HomsAreas,
  HamaAreas,
  TartousAreas,
  IdlibAreas,
  DaraaAreas,
  RaqqaAreas,
  DeirEzzorAreas,
  QuneitraAreas,
  SweidaAreas,
} from '../schemas/common.enums';

// ---------------------------------------------------------
// 1. Mapping: Linking City Enum to Area Enums
// ---------------------------------------------------------
const CityMapping: Record<City, any[]> = {
  [City.Damascus]: Object.values(DamascusAreas),
  [City.RifDimashq]: Object.values(RuralDamascusAreas),
  [City.Aleppo]: Object.values(AleppoAreas),
  [City.Homs]: Object.values(HomsAreas),
  [City.Hama]: Object.values(HamaAreas),
  [City.Latakia]: Object.values(LatakiaAreas),
  [City.Tartus]: Object.values(TartousAreas),
  [City.Idlib]: Object.values(IdlibAreas),
  [City.Raqqa]: Object.values(RaqqaAreas),
  [City.DeirEzzor]: Object.values(DeirEzzorAreas),
  [City.AlHasakah]: Object.values(HassakehAreas),
  [City.Daraa]: Object.values(DaraaAreas),
  [City.Suwayda]: Object.values(SweidaAreas),
  [City.Quneitra]: Object.values(QuneitraAreas),
};

// ---------------------------------------------------------
// 2. Main Seed Function
// ---------------------------------------------------------
async function seedCities() {
  console.log('🌍 Starting Cities & SubCities Seed...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  // Get Models
  const CityModel = app.get(getModelToken('Cities'));
  const SubCityModel = app.get(getModelToken('SubCities'));

  // 1. Clear Data
  console.log('🗑️  Clearing existing data...');
  await CityModel.deleteMany({});
  await SubCityModel.deleteMany({});
  console.log('✅ Data cleared\n');

  // 2. Seed Logic
  let cityCount = 0;
  let subCityCount = 0;

  for (const cityKey of Object.keys(CityMapping)) {
    const cityName = cityKey as City;
    const areas = CityMapping[cityName];

    // Create the City (stores Arabic name from City enum)
    const cityDoc = await CityModel.create({
      name: cityName,
    });
    cityCount++;

    if (areas && areas.length > 0) {
      const subCitiesPayload = areas.map((areaName) => ({
        name: areaName, // Stores Arabic name from Area enums
        cityId: cityDoc._id,
      }));

      await SubCityModel.insertMany(subCitiesPayload);
      subCityCount += subCitiesPayload.length;
    }

    console.log(`📍 Seeded City: ${cityName} with ${areas.length} areas.`);
  }

  // 3. Summary
  console.log('\n🎉 Cities & SubCities Seeding Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🏙️  Cities Created: ${cityCount}`);
  console.log(`🏘️  SubCities Created: ${subCityCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await app.close();
}

seedCities().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
