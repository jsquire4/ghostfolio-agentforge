import { AuthGuard } from '@ghostfolio/client/core/auth.guard';
import { internalRoutes } from '@ghostfolio/common/routes/routes';

import { Routes } from '@angular/router';

import { GfAiPageComponent } from './ai-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    component: GfAiPageComponent,
    path: '',
    title: internalRoutes.ai.title
  }
];
