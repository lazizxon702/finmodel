export interface PhoneModelItem {
  id: string;
  name: string;
  series: string;
  brand: 'apple' | 'samsung' | 'other';
  colors: string[];
  storages: string[];
  rams?: string[];
}

export const PHONE_CATALOG: PhoneModelItem[] = [
  // iPhone 16 Series
  {
    id: 'ip-16e',
    name: 'iPhone 16e',
    series: 'iPhone 16 Series',
    brand: 'apple',
    colors: ['Black', 'White'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    id: 'ip-16',
    name: 'iPhone 16',
    series: 'iPhone 16 Series',
    brand: 'apple',
    colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    id: 'ip-16-plus',
    name: 'iPhone 16 Plus',
    series: 'iPhone 16 Series',
    brand: 'apple',
    colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'],
    storages: ['128GB', '256GB', '512GB'],
  },
  {
    id: 'ip-16-pro',
    name: 'iPhone 16 Pro',
    series: 'iPhone 16 Series',
    brand: 'apple',
    colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'],
    storages: ['128GB', '256GB', '512GB', '1TB'],
  },
  {
    id: 'ip-16-promax',
    name: 'iPhone 16 Pro Max',
    series: 'iPhone 16 Series',
    brand: 'apple',
    colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'],
    storages: ['256GB', '512GB', '1TB'],
  },

  // iPhone 17 Series
  {
    id: 'ip-17e',
    name: 'iPhone 17e',
    series: 'iPhone 17 Series',
    brand: 'apple',
    colors: ['Black', 'White', 'Soft Pink'],
    storages: ['256GB', '512GB'],
  },
  {
    id: 'ip-17',
    name: 'iPhone 17',
    series: 'iPhone 17 Series',
    brand: 'apple',
    colors: ['Black', 'White', 'Mist Blue', 'Sage', 'Lavender'],
    storages: ['256GB', '512GB'],
  },
  {
    id: 'ip-air',
    name: 'iPhone Air',
    series: 'iPhone 17 Series',
    brand: 'apple',
    colors: ['Sky Blue', 'Light Gold', 'Cloud White', 'Space Black'],
    storages: ['256GB', '512GB', '1TB'],
  },
  {
    id: 'ip-17-pro',
    name: 'iPhone 17 Pro',
    series: 'iPhone 17 Series',
    brand: 'apple',
    colors: ['Silver', 'Cosmic Orange', 'Deep Blue'],
    storages: ['256GB', '512GB', '1TB'],
  },
  {
    id: 'ip-17-promax',
    name: 'iPhone 17 Pro Max',
    series: 'iPhone 17 Series',
    brand: 'apple',
    colors: ['Silver', 'Cosmic Orange', 'Deep Blue'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },

  // iPhone 18 Series
  {
    id: 'ip-18-pro',
    name: 'iPhone 18 Pro',
    series: 'iPhone 18 Series',
    brand: 'apple',
    colors: ['Black', 'Silver', 'Glacier', 'Burgundy'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },
  {
    id: 'ip-18-promax',
    name: 'iPhone 18 Pro Max',
    series: 'iPhone 18 Series',
    brand: 'apple',
    colors: ['Black', 'Silver', 'Glacier', 'Burgundy'],
    storages: ['256GB', '512GB', '1TB', '2TB'],
  },

  // Samsung Galaxy Series
  {
    id: 'sam-a18',
    name: 'Samsung Galaxy A18',
    series: 'Galaxy A Series',
    brand: 'samsung',
    colors: ['Black', 'Silver', 'Blue'],
    storages: ['128GB', '256GB'],
    rams: ['4GB', '6GB', '8GB'],
  },
  {
    id: 'sam-a57',
    name: 'Samsung Galaxy A57 5G',
    series: 'Galaxy A Series',
    brand: 'samsung',
    colors: ['Awesome Navy', 'Awesome Gray', 'Awesome Lilac', 'Awesome Icyblue'],
    storages: ['128GB', '256GB', '512GB'],
    rams: ['8GB'],
  },
  {
    id: 'sam-s26',
    name: 'Samsung Galaxy S26',
    series: 'Galaxy S26 Series',
    brand: 'samsung',
    colors: ['Cobalt Violet', 'Black', 'White', 'Sky Blue', 'Pink Gold', 'Silver Shadow'],
    storages: ['256GB', '512GB'],
    rams: ['12GB'],
  },
  {
    id: 'sam-s26-ultra',
    name: 'Samsung Galaxy S26 Ultra',
    series: 'Galaxy S26 Series',
    brand: 'samsung',
    colors: ['Cobalt Violet', 'Black', 'White', 'Sky Blue', 'Pink Gold', 'Silver Shadow'],
    storages: ['256GB', '512GB', '1TB'],
    rams: ['12GB', '16GB'],
  },
];

export const STANDARD_STORAGES = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
