import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteSettingsService } from '../../services/site-settings.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.html',
  styles: ``,
})
export class FooterComponent {
  siteSettings = inject(SiteSettingsService);
  photos = this.siteSettings.sitePhotos;
}
