-- Migration v1.7.0
-- Fix: les contenus générés (courses) ne doivent plus être supprimés
-- lorsque l'item source est supprimé.
--
-- Avant : courses.item_id NOT NULL REFERENCES items(id) ON DELETE CASCADE
-- Après : courses.item_id       NULL REFERENCES items(id) ON DELETE SET NULL
--
-- L'item_id devient NULL quand l'item est supprimé, mais le contenu généré
-- (cours, synthèse, guide, etc.) est conservé.

-- 1. Supprimer l'ancienne contrainte FK
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_item_id_fkey;

-- 2. Rendre item_id nullable (il ne pointe plus forcément vers un item existant)
ALTER TABLE courses ALTER COLUMN item_id DROP NOT NULL;

-- 3. Recréer la FK avec ON DELETE SET NULL
ALTER TABLE courses
    ADD CONSTRAINT courses_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL;
