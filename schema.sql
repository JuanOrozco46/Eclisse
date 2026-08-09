-- Script SQL para Supabase (Eclisse Pizza Napoletana)
-- Puedes copiar y pegar este código en el SQL Editor de tu Dashboard de Supabase

-- 1. Tabla para la carta / menú
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    ingredients JSONB DEFAULT '[]'::jsonb,
    available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS y lectura pública
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura pública en menu_items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Permitir escrituras en menu_items" ON public.menu_items FOR ALL USING (true);

-- 2. Limpiar e Insertar todos los platos y bebidas de la carta
TRUNCATE TABLE public.menu_items;

INSERT INTO public.menu_items (id, name, description, price, category, ingredients, available) VALUES
('1', 'Bianca', 'Salsa blanca de la casa, queso mozzarella, tocineta ahumada, queso costeño y pimienta.', 25000, 'Pizzas', '["Salsa blanca", "Queso mozzarella", "Tocineta ahumada", "Queso costeño", "Pimienta"]'::jsonb, true),
('2', 'Lumina', 'Salsa de tomate de la casa, queso mozzarella, tomate cherry, pesto y mozzarella di bufala.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Tomate cherry", "Pesto", "Mozzarella di bufala"]'::jsonb, true),
('3', 'Hawaianna', 'Piña caramelizada, jamón ahumado, queso mozzarella, salsa de tomate de la casa y cilantro.', 25000, 'Pizzas', '["Piña caramelizada", "Jamón ahumado", "Queso mozzarella", "Salsa de tomate", "Cilantro"]'::jsonb, true),
('4', 'Dorato', 'Salsa de tomate de la casa, chorizo ahumado en trozos, maíz dulce y queso costeño.', 25000, 'Pizzas', '["Salsa de tomate", "Chorizo ahumado", "Maíz dulce", "Queso costeño"]'::jsonb, true),
('5', 'Amalgama', 'Salsa de tomate de la casa, queso mozzarella, pollo en trozos, pimentón y cebolla morada.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Pollo en trozos", "Pimentón", "Cebolla morada"]'::jsonb, true),
('6', 'Dolce Fiamma', 'Salsa de tomate de la casa, queso mozzarella, pepperoni, cebolla morada y miel picante.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Pepperoni", "Cebolla morada", "Miel picante"]'::jsonb, true),
('7', 'Coca-Cola Original 250ml', 'Coca-Cola Original 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('8', 'Coca-Cola Zero 250ml', 'Coca-Cola Zero 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('9', 'Quatro 250ml', 'Quatro 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('10', 'Coca-Cola Original 1.5L', 'Coca-Cola Original 1.5 Litros', 8000, 'Bebidas', '[]'::jsonb, true),
('11', 'Coca-Cola Zero 1.5L', 'Coca-Cola Zero 1.5 Litros', 8000, 'Bebidas', '[]'::jsonb, true);
