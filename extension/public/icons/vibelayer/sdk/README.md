# @vibelayer/sdk

Embed VibeLayer's AI personalization directly inside your web app.

```bash
npm install @vibelayer/sdk
```

```tsx
import { VibeLayerButton } from '@vibelayer/sdk/react';

export function Settings() {
  return (
    <VibeLayerButton
      apiKey={process.env.NEXT_PUBLIC_VIBELAYER_KEY!}
      regions={['#sidebar', '#dashboard']}  // patches confined to these selectors
      branding={{ name: 'Customize', primaryColor: '#0ea5e9' }}
      onPatchApplied={(p) => console.log('applied', p.description)}
    />
  );
}
```

The `regions` prop is the security boundary. Generated CSS is automatically scoped to `:is(<regions>) :is(<selector>) { ... }` so patches physically cannot reach the rest of your app.

For lower-level control, use the vanilla client:

```ts
import { VibeLayerClient } from '@vibelayer/sdk';

const client = new VibeLayerClient({ apiKey, regions: ['main'] });
const patch = await client.generate('make headings bigger');
client.apply('my-patch-id', patch);
```
