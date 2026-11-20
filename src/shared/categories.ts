// Business categories shown in the picker. Each maps to OpenStreetMap tags; Google Maps uses the name itself.
export type Category = { name: string; group: string; osm: Record<string, string> };

const c = (group: string, list: [string, Record<string, string>][]): Category[] => list.map(([name, osm]) => ({ name, group, osm }));

export const CATEGORIES: Category[] = [
  ...c('Health', [
    ['Dentists', { amenity: 'dentist' }], ['Doctors', { amenity: 'doctors' }], ['Clinics', { amenity: 'clinic' }],
    ['Pharmacies', { amenity: 'pharmacy' }], ['Physiotherapists', { healthcare: 'physiotherapist' }], ['Chiropractors', { healthcare: 'chiropractor' }],
    ['Opticians', { shop: 'optician' }], ['Veterinarians', { amenity: 'veterinary' }], ['Psychologists', { healthcare: 'psychotherapist' }],
    ['Hospitals', { amenity: 'hospital' }], ['Hearing aid shops', { shop: 'hearing_aids' }], ['Medical labs', { healthcare: 'laboratory' }],
  ]),
  ...c('Beauty and wellness', [
    ['Hair salons', { shop: 'hairdresser' }], ['Barbers', { shop: 'hairdresser' }], ['Beauty salons', { shop: 'beauty' }],
    ['Nail salons', { shop: 'beauty', beauty: 'nails' }], ['Spas', { leisure: 'spa' }], ['Massage', { shop: 'massage' }],
    ['Tattoo studios', { shop: 'tattoo' }], ['Gyms', { leisure: 'fitness_centre' }], ['Yoga studios', { sport: 'yoga' }],
  ]),
  ...c('Professional services', [
    ['Lawyers', { office: 'lawyer' }], ['Accountants', { office: 'accountant' }], ['Tax advisors', { office: 'tax_advisor' }],
    ['Real estate agents', { office: 'estate_agent' }], ['Insurance agents', { office: 'insurance' }], ['Architects', { office: 'architect' }],
    ['Financial advisors', { office: 'financial_advisor' }], ['Consultants', { office: 'consulting' }], ['Marketing agencies', { office: 'advertising_agency' }],
    ['IT companies', { office: 'it' }], ['Employment agencies', { office: 'employment_agency' }], ['Notaries', { office: 'notary' }],
    ['Translators', { office: 'translator' }], ['Surveyors', { office: 'surveyor' }], ['Engineers', { office: 'engineer' }],
  ]),
  ...c('Home and trades', [
    ['Plumbers', { craft: 'plumber' }], ['Electricians', { craft: 'electrician' }], ['Roofers', { craft: 'roofer' }],
    ['HVAC contractors', { craft: 'hvac' }], ['Carpenters', { craft: 'carpenter' }], ['Painters', { craft: 'painter' }],
    ['Builders', { craft: 'builder' }], ['Landscapers', { craft: 'gardener' }], ['Locksmiths', { craft: 'locksmith' }],
    ['Cleaning services', { office: 'cleaning' }], ['Pest control', { craft: 'pest_control' }], ['Window installers', { craft: 'window_construction' }],
    ['Flooring', { shop: 'flooring' }], ['Kitchen stores', { shop: 'kitchen' }], ['Furniture stores', { shop: 'furniture' }],
    ['Hardware stores', { shop: 'hardware' }], ['Interior designers', { shop: 'interior_decoration' }],
  ]),
  ...c('Automotive', [
    ['Car repair', { shop: 'car_repair' }], ['Car dealers', { shop: 'car' }], ['Car parts', { shop: 'car_parts' }],
    ['Tyre shops', { shop: 'tyres' }], ['Car washes', { amenity: 'car_wash' }], ['Driving schools', { amenity: 'driving_school' }],
    ['Motorcycle dealers', { shop: 'motorcycle' }], ['Car rental', { amenity: 'car_rental' }],
  ]),
  ...c('Food and drink', [
    ['Restaurants', { amenity: 'restaurant' }], ['Cafes', { amenity: 'cafe' }], ['Bars', { amenity: 'bar' }], ['Pubs', { amenity: 'pub' }],
    ['Bakeries', { shop: 'bakery' }], ['Fast food', { amenity: 'fast_food' }], ['Caterers', { craft: 'caterer' }],
    ['Butchers', { shop: 'butcher' }], ['Grocery stores', { shop: 'supermarket' }], ['Wine shops', { shop: 'wine' }], ['Breweries', { craft: 'brewery' }],
  ]),
  ...c('Retail', [
    ['Clothing stores', { shop: 'clothes' }], ['Shoe stores', { shop: 'shoes' }], ['Jewellers', { shop: 'jewelry' }],
    ['Florists', { shop: 'florist' }], ['Gift shops', { shop: 'gift' }], ['Book stores', { shop: 'books' }],
    ['Electronics stores', { shop: 'electronics' }], ['Mobile phone shops', { shop: 'mobile_phone' }], ['Pet stores', { shop: 'pet' }],
    ['Sports stores', { shop: 'sports' }], ['Toy stores', { shop: 'toys' }], ['Bicycle shops', { shop: 'bicycle' }],
    ['Cosmetics stores', { shop: 'cosmetics' }], ['Opticians and eyewear', { shop: 'optician' }], ['Art galleries', { shop: 'art' }],
  ]),
  ...c('Education', [
    ['Schools', { amenity: 'school' }], ['Private schools', { amenity: 'school', 'school:type': 'private' }], ['Preschools', { amenity: 'kindergarten' }],
    ['Colleges', { amenity: 'college' }], ['Universities', { amenity: 'university' }], ['Tutoring', { office: 'tutoring' }],
    ['Language schools', { amenity: 'language_school' }], ['Music schools', { amenity: 'music_school' }], ['Training centres', { amenity: 'training' }],
  ]),
  ...c('Hospitality and travel', [
    ['Hotels', { tourism: 'hotel' }], ['Guest houses', { tourism: 'guest_house' }], ['Hostels', { tourism: 'hostel' }],
    ['Travel agencies', { shop: 'travel_agency' }], ['Event venues', { amenity: 'events_venue' }], ['Wedding planners', { office: 'event_management' }],
    ['Photographers', { craft: 'photographer' }], ['Tour operators', { office: 'travel_agent' }],
  ]),
  ...c('Community and other', [
    ['Churches', { amenity: 'place_of_worship' }], ['Non-profits', { office: 'ngo' }], ['Coworking spaces', { amenity: 'coworking_space' }],
    ['Storage', { shop: 'storage_rental' }], ['Printing shops', { shop: 'copyshop' }], ['Funeral homes', { shop: 'funeral_directors' }],
    ['Dry cleaners', { shop: 'dry_cleaning' }], ['Pet groomers', { shop: 'pet_grooming' }], ['Childcare', { amenity: 'childcare' }],
    ['Moving companies', { office: 'moving_company' }], ['Security companies', { office: 'security' }], ['Logistics', { office: 'logistics' }],
  ]),
];

export const categoryByName = (name: string) => CATEGORIES.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
