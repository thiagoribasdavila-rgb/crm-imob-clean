begin;

alter table public.project_materials
  drop constraint if exists project_materials_material_type_check;

alter table public.project_materials
  add constraint project_materials_material_type_check
  check (material_type in (
    'book', 'price_table', 'sales_mirror', 'floor_plan', 'presentation',
    'technical_memorial', 'registration_form', 'video', 'site_plan', 'other'
  ));

commit;
