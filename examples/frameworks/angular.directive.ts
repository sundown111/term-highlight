// Angular integration (standalone directive, Angular 15+). Illustrative: not compiled or
// executed by this repo's CI. Runs outside NgZone so MutationObserver callbacks do not
// trigger change detection on every highlight pass, and cleans up in ngOnDestroy.
// SSR: ngAfterViewInit only runs in the browser for this use, but guard with isPlatformBrowser.
import {
  Directive,
  ElementRef,
  Inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  PLATFORM_ID,
  AfterViewInit,
  SimpleChanges,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createHighlighter, type Highlighter } from 'term-highlight';

@Directive({ selector: '[termHighlight]', standalone: true })
export class TermHighlightDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input('termHighlight') terms: string[] = [];
  private highlighter?: Highlighter;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.zone.runOutsideAngular(() => {
      this.highlighter = createHighlighter({
        root: this.host.nativeElement,
        groups: [{ name: 'search', terms: this.terms }],
        autoUpdate: { debounce: 50 },
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['terms'] && this.highlighter) {
      this.zone.runOutsideAngular(() => this.highlighter!.setTerms('search', this.terms));
    }
  }

  ngOnDestroy(): void {
    this.highlighter?.destroy();
    this.highlighter = undefined;
  }
}

// Usage:  <article [termHighlight]="['angular', 'zone']">...</article>
