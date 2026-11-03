import bpy, sys; sys.path.insert(0,'blender'); import vrm_env
vrm_env.setup()
bpy.ops.import_scene.vrm(filepath='out/deliver/alice_v1.1_alpha.vrm')
for o in bpy.data.objects:
    if o.type=='MESH':
        zs=[(o.matrix_world@v.co) for v in o.data.vertices]
        print(o.name,len(o.data.vertices),'z',round(min(p.z for p in zs),3),round(max(p.z for p in zs),3),'y',round(min(p.y for p in zs),3),round(max(p.y for p in zs),3),'mats',[m.name for m in o.data.materials],'vg',len(o.vertex_groups), 'sk', len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0)
a=next(o for o in bpy.data.objects if o.type=='ARMATURE'); print('ARM',a.name)
for b in a.data.bones:
    if any(k in b.name for k in ('Hips','Spine','Neck','Head','Shoulder','Arm','Leg','Hand')) and 'Hand' not in b.name[:-1] or b.name.endswith('Hand'):
        h=a.matrix_world@b.head_local; print(' ',b.name,tuple(round(x,3) for x in h))
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/alice_vrm/fin/base.blend')
