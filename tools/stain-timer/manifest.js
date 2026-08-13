window.labtoolsToolManifest = {
  id: 'stain-timer', name: 'Stain Timer', icon: '⏱',
  description: 'Configurable step-by-step staining protocol timer with alarm. Design your protocol, then run it with countdown and audio cues.',
  category: 'Cell Culture',
  produces: ['protocol'], consumes: ['protocol'],
  outputFields: [{ id: 'protocol', label: 'Staining protocol' }],
  inputPorts: [{ field: 'protocol' }],
  next: [],
};
